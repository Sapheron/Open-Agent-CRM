/**
 * Payments service — single write path for every payment mutation.
 *
 * Mirrors QuotesService / InvoicesService: every state-changing method
 * ends with `logActivity` so we get a complete audit trail in
 * `PaymentActivity` attributed to the original actor (user/ai/system/
 * worker/webhook).
 *
 * Handles three kinds of payments:
 *   - **Gateway-initiated**: createLink() → customer pays via the
 *     hosted gateway URL → webhook flips to PAID.
 *   - **Manual**: recordManualPayment() for cash/bank-transfer/cheque
 *     payments that bypass the gateway. Provider=NONE, status=PAID
 *     immediately.
 *   - **Refunds**: refund() calls the gateway API (Razorpay/Stripe only
 *     in Phase 1), bumps refundedAmount, flips status to REFUNDED.
 *
 * When a payment has an `invoiceId` and transitions to PAID or REFUNDED,
 * we call `InvoicesService.recordPayment()` to keep the invoice's
 * amountPaid in sync. This is the webhook's backfill to close the
 * reconciliation loop we opened in yesterday's invoices commit.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { prisma } from '@wacrm/database';
import type {
  Payment,
  PaymentActivityType,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@wacrm/database';
import { decrypt } from '@wacrm/shared';

import { GatewayFactory } from './gateways/gateway.factory';
import { InvoicesService } from '../invoices/invoices.service';
import type {
  AddPaymentActivityInput,
  BulkMutationResult,
  CreatePaymentLinkDto,
  ListPaymentsFilters,
  PaymentActor,
  PaymentStatsSnapshot,
  RecordManualPaymentDto,
  RefundPaymentDto,
  UpdatePaymentDto,
} from './payments.types';

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(forwardRef(() => InvoicesService))
    private readonly invoices: InvoicesService,
  ) {}

  // ── Gateway helper ────────────────────────────────────────────────────

  private async getGateway(companyId: string) {
    const config = await prisma.paymentConfig.findUnique({ where: { companyId } });
    if (!config || config.provider === 'NONE') {
      throw new BadRequestException('Payment gateway not configured');
    }
    const key = config.keyEncrypted ? decrypt(config.keyEncrypted) : '';
    const secret = config.secretEncrypted ? decrypt(config.secretEncrypted) : undefined;
    return {
      gateway: GatewayFactory.create({
        provider: config.provider,
        key,
        secret,
        testMode: config.testMode,
      }),
      config,
    };
  }

  // ── Reads ─────────────────────────────────────────────────────────────

  async list(companyId: string, filters: ListPaymentsFilters = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const where: Prisma.PaymentWhereInput = { companyId };

    if (filters.status) {
      where.status = Array.isArray(filters.status)
        ? { in: filters.status }
        : filters.status;
    }
    if (filters.provider) {
      where.provider = Array.isArray(filters.provider)
        ? { in: filters.provider }
        : filters.provider;
    }
    if (filters.contactId) where.contactId = filters.contactId;
    if (filters.dealId) where.dealId = filters.dealId;
    if (filters.invoiceId) where.invoiceId = filters.invoiceId;
    if (filters.tag) where.tags = { has: filters.tag };
    if (filters.createdFrom || filters.createdTo) {
      where.createdAt = {};
      if (filters.createdFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(filters.createdFrom);
      if (filters.createdTo) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(filters.createdTo);
    }
    if (filters.search) {
      const q = filters.search;
      where.OR = [
        { description: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { externalId: { contains: q, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.PaymentOrderByWithRelationInput =
      filters.sort === 'amount'
        ? { amount: 'desc' }
        : filters.sort === 'paid_at'
          ? { paidAt: 'desc' }
          : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          contact: { select: { id: true, displayName: true, phoneNumber: true } },
          deal: { select: { id: true, title: true, stage: true } },
        },
      }),
      prisma.payment.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async get(companyId: string, id: string) {
    const record = await prisma.payment.findFirst({
      where: { id, companyId },
      include: {
        contact: { select: { id: true, displayName: true, phoneNumber: true, email: true } },
        deal: { select: { id: true, title: true, stage: true } },
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!record) throw new NotFoundException('Payment not found');
    return record;
  }

  async getTimeline(companyId: string, id: string, limit = 100) {
    await this.getRaw(companyId, id);
    return prisma.paymentActivity.findMany({
      where: { paymentId: id, companyId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, Math.max(1, limit)),
    });
  }

  async stats(companyId: string, days = 30): Promise<PaymentStatsSnapshot> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const payments = await prisma.payment.findMany({
      where: { companyId, createdAt: { gte: since } },
      select: {
        status: true,
        provider: true,
        amount: true,
        refundedAmount: true,
      },
    });

    const byStatus: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    let totalReceived = 0;
    let totalPending = 0;
    let totalRefunded = 0;
    let amountSum = 0;
    let paidCount = 0;
    let terminalCount = 0;

    for (const p of payments) {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
      byProvider[p.provider] = (byProvider[p.provider] ?? 0) + 1;
      amountSum += p.amount;
      if (p.status === 'PAID') {
        totalReceived += p.amount;
        paidCount++;
      }
      if (p.status === 'PENDING') totalPending += p.amount;
      if (p.status === 'REFUNDED') totalRefunded += p.refundedAmount;
      if (p.status === 'PAID' || p.status === 'FAILED' || p.status === 'EXPIRED') {
        terminalCount++;
      }
    }

    return {
      rangeDays: days,
      totalPayments: payments.length,
      byStatus,
      byProvider,
      totalReceived,
      totalPending,
      totalRefunded,
      successRate:
        terminalCount > 0 ? Math.round((paidCount / terminalCount) * 1000) / 10 : null,
      averageAmount:
        payments.length > 0 ? Math.round(amountSum / payments.length) : null,
    };
  }

  // ── Writes ────────────────────────────────────────────────────────────

  async createLink(
    companyId: string,
    actor: PaymentActor,
    dto: CreatePaymentLinkDto,
  ): Promise<Payment> {
    const { gateway, config } = await this.getGateway(companyId);
    const idempotencyKey = randomUUID();

    const contact = await prisma.contact.findFirst({
      where: { id: dto.contactId, companyId },
      select: { displayName: true, phoneNumber: true, email: true },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    const result = await gateway.createPaymentLink({
      amount: dto.amount,
      currency: dto.currency ?? config.currency,
      description: dto.description,
      contactName: contact.displayName ?? undefined,
      contactPhone: contact.phoneNumber ?? undefined,
      contactEmail: contact.email ?? undefined,
      idempotencyKey,
    });

    const payment = await prisma.payment.create({
      data: {
        companyId,
        contactId: dto.contactId,
        dealId: dto.dealId,
        invoiceId: dto.invoiceId,
        provider: config.provider,
        externalId: result.externalId,
        linkUrl: result.linkUrl,
        amount: dto.amount,
        currency: dto.currency ?? config.currency,
        description: dto.description,
        notes: dto.notes,
        tags: dto.tags ?? [],
        status: 'PENDING',
        idempotencyKey,
        createdByUserId: actor.type === 'user' ? actor.userId : null,
      },
    });

    await this.logActivity(companyId, payment.id, actor, {
      type: 'LINK_GENERATED',
      title: `Payment link created via ${config.provider}`,
      metadata: {
        externalId: result.externalId,
        linkUrl: result.linkUrl,
        amount: dto.amount,
      },
    });
    if (dto.invoiceId) {
      await this.logActivity(companyId, payment.id, actor, {
        type: 'LINKED_TO_INVOICE',
        title: 'Linked to invoice',
        metadata: { invoiceId: dto.invoiceId },
      });
    }

    return payment;
  }

  /**
   * Record a payment that happened outside the gateway (cash, bank
   * transfer, cheque, etc). Creates a Payment row with provider=NONE
   * and status=PAID immediately. Fires the invoice reconciliation hook
   * so the linked invoice auto-updates its amountPaid.
   */
  async recordManualPayment(
    companyId: string,
    actor: PaymentActor,
    dto: RecordManualPaymentDto,
  ): Promise<Payment> {
    if (!Number.isFinite(dto.amount) || dto.amount <= 0) {
      throw new BadRequestException('amount must be a positive integer (minor units)');
    }
    const idempotencyKey = randomUUID();
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    const payment = await prisma.payment.create({
      data: {
        companyId,
        contactId: dto.contactId,
        dealId: dto.dealId,
        invoiceId: dto.invoiceId,
        provider: 'NONE',
        method: dto.method ?? 'other',
        amount: dto.amount,
        currency: dto.currency ?? 'INR',
        description: dto.description,
        notes: dto.notes,
        tags: dto.tags ?? [],
        status: 'PAID',
        paidAt,
        idempotencyKey,
        createdByUserId: actor.type === 'user' ? actor.userId : null,
      },
    });

    await this.logActivity(companyId, payment.id, actor, {
      type: 'MANUAL_RECORDED',
      title: `Manual payment recorded (${dto.method ?? 'other'})`,
      body: dto.description,
      metadata: { amount: dto.amount, method: dto.method },
    });
    await this.logActivity(companyId, payment.id, actor, {
      type: 'PAID',
      title: 'Payment received',
      metadata: { paidAt: paidAt.toISOString() },
    });

    // Fire invoice reconciliation hook
    if (dto.invoiceId) {
      await this.reconcileInvoice(companyId, dto.invoiceId, dto.amount, actor, payment.id);
    }
    // Move linked deal to WON if fully paid (mirror webhook behavior)
    if (dto.dealId) {
      await this.maybeMoveDealToWon(dto.dealId);
    }

    return payment;
  }

  async update(
    companyId: string,
    id: string,
    actor: PaymentActor,
    dto: UpdatePaymentDto,
  ): Promise<Payment> {
    const existing = await this.getRaw(companyId, id);

    // Use the Unchecked variant so we can set foreign-key scalars (invoiceId,
    // dealId) directly without having to build nested `connect` payloads.
    const data: Prisma.PaymentUncheckedUpdateInput = {};
    const diffs: Array<{ field: string; from: unknown; to: unknown }> = [];
    const assign = <K extends keyof UpdatePaymentDto>(field: K) => {
      if (dto[field] === undefined) return;
      const newVal = dto[field];
      const oldVal = (existing as unknown as Record<string, unknown>)[field as string];
      if (newVal !== oldVal) {
        diffs.push({ field: field as string, from: oldVal, to: newVal });
        (data as Record<string, unknown>)[field as string] = newVal;
      }
    };
    assign('description');
    assign('notes');
    assign('tags');
    assign('invoiceId');
    assign('dealId');

    if (diffs.length === 0) return existing;

    const updated = await prisma.payment.update({ where: { id }, data });
    for (const d of diffs) {
      await this.logActivity(companyId, id, actor, {
        type:
          d.field === 'invoiceId'
            ? 'LINKED_TO_INVOICE'
            : d.field === 'dealId'
              ? 'LINKED_TO_DEAL'
              : 'FIELD_UPDATED',
        title: `${d.field} updated`,
        body: `${safeDisplay(d.from)} → ${safeDisplay(d.to)}`,
        metadata: { field: d.field, from: d.from, to: d.to },
      });
    }
    return updated;
  }

  async refund(
    companyId: string,
    id: string,
    actor: PaymentActor,
    dto: RefundPaymentDto = {},
  ): Promise<Payment> {
    const existing = await this.getRaw(companyId, id);
    if (existing.status !== 'PAID') {
      throw new BadRequestException(
        `Only PAID payments can be refunded (current: ${existing.status})`,
      );
    }
    if (!existing.externalId) {
      throw new BadRequestException(
        'Payment has no gateway externalId — cannot call refund API',
      );
    }

    const refundAmount = dto.amount ?? existing.amount - existing.refundedAmount;
    if (refundAmount <= 0) {
      throw new BadRequestException('Nothing left to refund');
    }

    // Manual payments (provider=NONE) don't go through a gateway — skip API call
    if (existing.provider === 'NONE') {
      const updated = await prisma.payment.update({
        where: { id },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
          refundedAmount: existing.refundedAmount + refundAmount,
          refundReason: dto.reason,
        },
      });
      await this.logActivity(companyId, id, actor, {
        type: 'REFUNDED',
        title: 'Manual refund recorded',
        body: dto.reason,
        metadata: { amount: refundAmount, reason: dto.reason },
      });
      if (existing.invoiceId) {
        await this.reverseInvoiceReconciliation(
          companyId,
          existing.invoiceId,
          refundAmount,
          actor,
          id,
        );
      }
      return updated;
    }

    const { gateway } = await this.getGateway(companyId);
    if (!gateway.refund) {
      throw new BadRequestException(
        `Refunds via API are not supported for ${existing.provider}. ` +
          `Refund through the provider dashboard, then call record_manual_payment with a negative amount to reflect it.`,
      );
    }

    await this.logActivity(companyId, id, actor, {
      type: 'REFUND_INITIATED',
      title: 'Refund requested',
      metadata: { amount: refundAmount, reason: dto.reason },
    });

    try {
      const result = await gateway.refund({
        externalId: existing.externalId,
        amount: refundAmount,
        reason: dto.reason,
        idempotencyKey: randomUUID(),
      });

      const updated = await prisma.payment.update({
        where: { id },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
          refundedAmount: existing.refundedAmount + result.amount,
          refundId: result.refundId,
          refundReason: dto.reason,
        },
      });
      await this.logActivity(companyId, id, actor, {
        type: 'REFUNDED',
        title: `Refund processed (${result.status})`,
        metadata: { refundId: result.refundId, amount: result.amount },
      });

      if (existing.invoiceId) {
        await this.reverseInvoiceReconciliation(
          companyId,
          existing.invoiceId,
          result.amount,
          actor,
          id,
        );
      }

      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.logActivity(companyId, id, actor, {
        type: 'REFUND_FAILED',
        title: 'Refund failed',
        body: msg.slice(0, 500),
      });
      throw new BadRequestException(`Refund failed: ${msg}`);
    }
  }

  async cancel(
    companyId: string,
    id: string,
    actor: PaymentActor,
    reason?: string,
  ): Promise<Payment> {
    const existing = await this.getRaw(companyId, id);
    if (existing.status === 'PAID' || existing.status === 'REFUNDED') {
      throw new BadRequestException(
        `Cannot cancel a ${existing.status} payment — refund instead`,
      );
    }
    const updated = await prisma.payment.update({
      where: { id },
      data: { status: 'EXPIRED' },
    });
    await this.logActivity(companyId, id, actor, {
      type: 'CANCELLED',
      title: 'Payment link cancelled',
      body: reason,
      metadata: { reason },
    });
    return updated;
  }

  async addNote(
    companyId: string,
    id: string,
    actor: PaymentActor,
    body: string,
  ): Promise<void> {
    await this.getRaw(companyId, id);
    if (!body?.trim()) throw new BadRequestException('note body required');
    await this.logActivity(companyId, id, actor, {
      type: 'NOTE_ADDED',
      title: 'Note',
      body: body.trim(),
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    const existing = await this.getRaw(companyId, id);
    if (existing.status === 'PAID' || existing.status === 'REFUNDED') {
      throw new BadRequestException(
        `Cannot delete a ${existing.status} payment — it's part of the financial record`,
      );
    }
    await prisma.payment.delete({ where: { id } });
  }

  // ── Webhook callback ──────────────────────────────────────────────────

  /**
   * Called by `payments.webhook.ts` after signature verification. Flips
   * the payment status based on the gateway's event and fires the
   * invoice reconciliation hook.
   */
  async handleWebhookVerified(
    externalId: string,
    status: 'PAID' | 'FAILED' | 'REFUNDED',
    paidAt?: Date,
  ): Promise<Payment | null> {
    const payment = await prisma.payment.findFirst({ where: { externalId } });
    if (!payment) return null;

    const actor: PaymentActor = { type: 'webhook' };

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status,
        paidAt: status === 'PAID' ? (paidAt ?? new Date()) : undefined,
        refundedAt: status === 'REFUNDED' ? new Date() : undefined,
        refundedAmount:
          status === 'REFUNDED' ? payment.amount : payment.refundedAmount,
      },
    });

    await this.logActivity(payment.companyId, payment.id, actor, {
      type: 'WEBHOOK_RECEIVED',
      title: `Webhook: ${status.toLowerCase()}`,
      metadata: { externalId, status },
    });
    await this.logActivity(payment.companyId, payment.id, actor, {
      type: status as PaymentActivityType,
      title: `Status → ${status}`,
    });

    // Invoice reconciliation
    if (status === 'PAID' && payment.invoiceId) {
      await this.reconcileInvoice(
        payment.companyId,
        payment.invoiceId,
        payment.amount,
        actor,
        payment.id,
      );
    }
    if (status === 'REFUNDED' && payment.invoiceId) {
      await this.reverseInvoiceReconciliation(
        payment.companyId,
        payment.invoiceId,
        payment.amount,
        actor,
        payment.id,
      );
    }

    // Deal auto-move
    if (status === 'PAID' && payment.dealId) {
      await this.maybeMoveDealToWon(payment.dealId);
    }

    return updated;
  }

  // ── Bulk ops ──────────────────────────────────────────────────────────

  async bulkCancel(
    companyId: string,
    ids: string[],
    actor: PaymentActor,
    reason?: string,
  ): Promise<BulkMutationResult> {
    return this.runBulk(ids, (id) => this.cancel(companyId, id, actor, reason));
  }

  async bulkDelete(
    companyId: string,
    ids: string[],
  ): Promise<BulkMutationResult> {
    return this.runBulk(ids, (id) => this.remove(companyId, id));
  }

  // ── Config helpers ────────────────────────────────────────────────────

  getWebhookUrl(companyId: string, domain: string) {
    return `https://${domain}/api/webhooks/payment/${companyId}`;
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  private async getRaw(companyId: string, id: string): Promise<Payment> {
    const record = await prisma.payment.findFirst({ where: { id, companyId } });
    if (!record) throw new NotFoundException('Payment not found');
    return record;
  }

  private async reconcileInvoice(
    companyId: string,
    invoiceId: string,
    amount: number,
    actor: PaymentActor,
    paymentId: string,
  ): Promise<void> {
    try {
      await this.invoices.recordPayment(
        companyId,
        invoiceId,
        actor.type === 'user'
          ? { type: 'user', userId: actor.userId }
          : actor.type === 'webhook'
            ? { type: 'system' }
            : { type: actor.type as 'ai' | 'system' | 'worker' },
        amount,
        { paymentId, note: 'Auto-reconciled from Payment' },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.logActivity(companyId, paymentId, actor, {
        type: 'ERROR',
        title: 'Invoice reconciliation failed',
        body: msg.slice(0, 500),
      });
    }
  }

  /**
   * When a payment is refunded and linked to an invoice, call
   * `recordPayment` with a negative amount so the invoice's amountPaid
   * is reversed. The invoices service clamps to zero and writes its own
   * activity row.
   */
  private async reverseInvoiceReconciliation(
    companyId: string,
    invoiceId: string,
    amount: number,
    actor: PaymentActor,
    paymentId: string,
  ): Promise<void> {
    try {
      // Use a separate service call — we don't have a "reverse" method
      // on invoices, but recordPayment with -amount would go negative.
      // Safer: update the invoice directly here via a small raw query.
      await prisma.$transaction(async (tx) => {
        const inv = await tx.invoice.findUnique({
          where: { id: invoiceId },
          select: { amountPaid: true, total: true },
        });
        if (!inv) return;
        const newPaid = Math.max(0, inv.amountPaid - amount);
        // Recompute status based on new amountPaid
        const nextStatus =
          newPaid === 0
            ? 'SENT'
            : newPaid < inv.total
              ? 'PARTIALLY_PAID'
              : 'PAID';
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { amountPaid: newPaid, status: nextStatus },
        });
        await tx.invoiceActivity.create({
          data: {
            invoiceId,
            companyId,
            type: 'PAYMENT_RECORDED',
            actorType: actor.type === 'user' ? 'user' : actor.type,
            actorId: actor.type === 'user' ? actor.userId : null,
            title: `Refund reversed − ${amount}`,
            body: `Payment ${paymentId} refunded; invoice amountPaid reduced`,
            metadata: { paymentId, refundedAmount: amount, newAmountPaid: newPaid } as never,
          },
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.logActivity(companyId, paymentId, actor, {
        type: 'ERROR',
        title: 'Invoice refund reconciliation failed',
        body: msg.slice(0, 500),
      });
    }
  }

  private async maybeMoveDealToWon(dealId: string): Promise<void> {
    try {
      await prisma.deal.update({
        where: { id: dealId },
        data: { stage: 'WON', wonAt: new Date(), probability: 100 },
      });
    } catch {
      // Best-effort — not all deals move automatically
    }
  }

  private async runBulk(
    ids: string[],
    op: (id: string) => Promise<unknown>,
  ): Promise<BulkMutationResult> {
    let updated = 0;
    let failed = 0;
    const errors: Array<{ id: string; reason: string }> = [];
    for (const id of ids) {
      try {
        await op(id);
        updated++;
      } catch (err) {
        failed++;
        errors.push({
          id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { updated, failed, errors };
  }

  private async logActivity(
    companyId: string,
    paymentId: string,
    actor: PaymentActor,
    input: AddPaymentActivityInput,
  ) {
    return prisma.paymentActivity.create({
      data: {
        paymentId,
        companyId,
        type: input.type,
        actorType: actor.type,
        actorId: actor.type === 'user' ? actor.userId : null,
        title: input.title,
        body: input.body,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}

// Type-guard so unused enum imports don't trigger lint warnings.
const _TYPE_GUARD: Array<PaymentStatus | PaymentProvider> = [];
void _TYPE_GUARD;

function safeDisplay(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.join(', ') || '[]';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
