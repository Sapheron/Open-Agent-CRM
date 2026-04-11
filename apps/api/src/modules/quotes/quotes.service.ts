/**
 * Quotes service — single write path for every quote mutation.
 *
 * Mirrors Campaigns / Forms / Leads / Deals: every state-changing method
 * ends with a call to `logActivity` so we get a complete audit trail in
 * `QuoteActivity` attributed to the original actor (user / ai / system /
 * worker / public).
 *
 * Customer-facing flow: draft → add line items → send → (customer views
 * via public token URL) → accept / reject. Accepting an ACTIVE quote with
 * `autoMoveDealOnAccept=true` also moves the linked Deal to WON via
 * DealsService.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { prisma } from '@wacrm/database';
import type {
  Prisma,
  Quote,
  QuoteActivityType,
  QuoteLineItem,
  QuoteStatus,
} from '@wacrm/database';

import {
  computeQuoteTotals,
  generateQuoteNumber,
  lineItemTotal,
} from './quotes.calc';
import type {
  AddQuoteActivityInput,
  BulkMutationResult,
  CreateQuoteDto,
  LineItemInput,
  ListQuotesFilters,
  PublicQuoteDefinition,
  QuoteActor,
  QuoteStatsSnapshot,
  UpdateQuoteDto,
} from './quotes.types';

const EDITABLE_STATUSES: QuoteStatus[] = ['DRAFT', 'SENT'];

@Injectable()
export class QuotesService {
  // ── Reads ─────────────────────────────────────────────────────────────

  async list(companyId: string, filters: ListQuotesFilters = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const where: Prisma.QuoteWhereInput = { companyId };

    if (filters.status) {
      where.status = Array.isArray(filters.status)
        ? { in: filters.status }
        : filters.status;
    }
    if (filters.contactId) where.contactId = filters.contactId;
    if (filters.dealId) where.dealId = filters.dealId;
    if (filters.tag) where.tags = { has: filters.tag };
    if (filters.createdFrom || filters.createdTo) {
      where.createdAt = {};
      if (filters.createdFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(filters.createdFrom);
      if (filters.createdTo) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(filters.createdTo);
    }
    if (filters.search) {
      const q = filters.search;
      where.OR = [
        { quoteNumber: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.QuoteOrderByWithRelationInput =
      filters.sort === 'total'
        ? { total: 'desc' }
        : filters.sort === 'number'
          ? { quoteNumber: 'asc' }
          : filters.sort === 'valid_until'
            ? { validUntil: 'asc' }
            : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      prisma.quote.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          lineItems: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      prisma.quote.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async get(companyId: string, id: string) {
    const record = await prisma.quote.findFirst({
      where: { id, companyId },
      include: {
        lineItems: { orderBy: { sortOrder: 'asc' } },
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!record) throw new NotFoundException('Quote not found');
    return record;
  }

  async getTimeline(companyId: string, id: string, limit = 100) {
    await this.getRaw(companyId, id);
    return prisma.quoteActivity.findMany({
      where: { quoteId: id, companyId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, Math.max(1, limit)),
    });
  }

  async stats(companyId: string, days = 30): Promise<QuoteStatsSnapshot> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const quotes = await prisma.quote.findMany({
      where: { companyId, createdAt: { gte: since } },
      select: { status: true, total: true },
    });

    const byStatus: Record<string, number> = {};
    let totalValue = 0;
    let acceptedValue = 0;
    let acceptedCount = 0;
    let sentCount = 0;
    for (const q of quotes) {
      byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
      totalValue += q.total;
      if (q.status === 'ACCEPTED') {
        acceptedValue += q.total;
        acceptedCount++;
      }
      if (
        q.status === 'SENT' ||
        q.status === 'VIEWED' ||
        q.status === 'ACCEPTED' ||
        q.status === 'REJECTED'
      ) {
        sentCount++;
      }
    }

    return {
      rangeDays: days,
      totalQuotes: quotes.length,
      byStatus,
      totalValue,
      acceptedValue,
      acceptanceRate:
        sentCount > 0 ? Math.round((acceptedCount / sentCount) * 1000) / 10 : null,
      averageValue:
        quotes.length > 0 ? Math.round(totalValue / quotes.length) : null,
    };
  }

  /**
   * Public view — looked up by token only. Returns a scrubbed subset that
   * the customer is allowed to see (no notes, no internal tags).
   */
  async getPublicByToken(token: string): Promise<PublicQuoteDefinition | null> {
    const record = await prisma.quote.findUnique({
      where: { publicToken: token },
      include: {
        lineItems: { orderBy: { sortOrder: 'asc' } },
        // Company name from the legacy Company model
      },
    });
    if (!record) return null;

    // Only show quotes that are in a customer-viewable state
    const viewable: QuoteStatus[] = [
      'SENT',
      'VIEWED',
      'ACCEPTED',
      'REJECTED',
      'EXPIRED',
    ];
    if (!viewable.includes(record.status)) return null;

    const company = await prisma.company.findUnique({
      where: { id: record.companyId },
      select: { name: true },
    });

    return {
      id: record.id,
      quoteNumber: record.quoteNumber,
      title: record.title,
      description: record.description,
      status: record.status,
      subtotal: record.subtotal,
      tax: record.tax,
      taxBps: record.taxBps,
      discount: record.discount,
      total: record.total,
      currency: record.currency,
      validUntil: record.validUntil,
      terms: record.terms,
      lineItems: record.lineItems.map((li) => ({
        name: li.name,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        discountBps: li.discountBps,
        total: li.total,
      })),
      company: { name: company?.name ?? 'Unknown' },
    };
  }

  // ── Writes ────────────────────────────────────────────────────────────

  async create(
    companyId: string,
    actor: QuoteActor,
    dto: CreateQuoteDto,
  ): Promise<Quote> {
    const quoteNumber = dto.quoteNumber?.trim() || (await this.uniqueQuoteNumber(companyId));
    const publicToken = randomBytes(16).toString('hex');

    // Compute totals from line items
    const lineItems = dto.lineItems ?? [];
    const totals = computeQuoteTotals({
      lineItems: lineItems.map((li) => ({
        quantity: li.quantity ?? 1,
        unitPrice: li.unitPrice ?? 0,
        discountBps: li.discountBps ?? 0,
      })),
      discount: dto.discount,
      taxBps: dto.taxBps,
    });

    const quote = await prisma.quote.create({
      data: {
        companyId,
        contactId: dto.contactId,
        dealId: dto.dealId,
        quoteNumber,
        publicToken,
        title: dto.title,
        description: dto.description,
        subtotal: totals.subtotal,
        tax: totals.tax,
        taxBps: dto.taxBps ?? 0,
        discount: totals.discount,
        total: totals.total,
        currency: dto.currency ?? 'INR',
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        notes: dto.notes,
        terms: dto.terms,
        tags: dto.tags ?? [],
        autoMoveDealOnAccept: dto.autoMoveDealOnAccept ?? false,
        createdByUserId: actor.type === 'user' ? actor.userId : null,
        lineItems: {
          create: lineItems.map((li, i) => ({
            sortOrder: i + 1,
            productId: li.productId,
            name: li.name,
            description: li.description,
            quantity: li.quantity ?? 1,
            unitPrice: li.unitPrice ?? 0,
            discountBps: li.discountBps ?? 0,
            total: lineItemTotal(li.quantity ?? 1, li.unitPrice ?? 0, li.discountBps ?? 0),
          })),
        },
      },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    await this.logActivity(companyId, quote.id, actor, {
      type: 'CREATED',
      title: `Quote ${quote.quoteNumber} created`,
      metadata: { total: quote.total, lineItemCount: lineItems.length },
    });
    return quote;
  }

  async update(
    companyId: string,
    id: string,
    actor: QuoteActor,
    dto: UpdateQuoteDto,
  ): Promise<Quote> {
    const existing = await this.getRaw(companyId, id);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(
        `Cannot edit a quote in status ${existing.status}. Revoke or duplicate it first.`,
      );
    }

    const data: Prisma.QuoteUpdateInput = {};
    const diffs: Array<{ field: string; from: unknown; to: unknown }> = [];

    const assign = <K extends keyof UpdateQuoteDto>(field: K) => {
      if (dto[field] === undefined) return;
      const newVal = dto[field];
      const oldVal = (existing as unknown as Record<string, unknown>)[field as string];
      if (newVal !== oldVal) {
        diffs.push({ field: field as string, from: oldVal, to: newVal });
        if (field === 'validUntil') {
          data.validUntil = newVal ? new Date(newVal as string | Date) : null;
        } else if (field === 'contactId') {
          data.contactId = newVal as string | null;
        } else if (field === 'dealId') {
          data.dealId = newVal as string | null;
        } else {
          (data as Record<string, unknown>)[field as string] = newVal;
        }
      }
    };
    assign('title');
    assign('description');
    assign('contactId');
    assign('dealId');
    assign('currency');
    assign('validUntil');
    assign('notes');
    assign('terms');
    assign('tags');
    assign('autoMoveDealOnAccept');

    // Tax/discount changes require recomputing totals
    const taxChanged = dto.taxBps !== undefined && dto.taxBps !== existing.taxBps;
    const discountChanged = dto.discount !== undefined && dto.discount !== existing.discount;
    if (taxChanged || discountChanged) {
      const lineItems = await prisma.quoteLineItem.findMany({
        where: { quoteId: id },
        select: { quantity: true, unitPrice: true, discountBps: true },
      });
      const totals = computeQuoteTotals({
        lineItems,
        discount: dto.discount ?? existing.discount,
        taxBps: dto.taxBps ?? existing.taxBps,
      });
      data.subtotal = totals.subtotal;
      data.tax = totals.tax;
      data.taxBps = dto.taxBps ?? existing.taxBps;
      data.discount = totals.discount;
      data.total = totals.total;
      if (taxChanged) diffs.push({ field: 'taxBps', from: existing.taxBps, to: dto.taxBps });
      if (discountChanged) diffs.push({ field: 'discount', from: existing.discount, to: dto.discount });
    }

    if (diffs.length === 0) return existing;

    const updated = await prisma.quote.update({
      where: { id },
      data,
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });

    for (const d of diffs) {
      await this.logActivity(companyId, id, actor, {
        type: 'FIELD_UPDATED',
        title: `${d.field} updated`,
        body: `${safeDisplay(d.from)} → ${safeDisplay(d.to)}`,
        metadata: { field: d.field, from: d.from, to: d.to },
      });
    }
    return updated;
  }

  async addLineItem(
    companyId: string,
    id: string,
    actor: QuoteActor,
    item: LineItemInput,
  ): Promise<Quote> {
    const existing = await this.getRaw(companyId, id);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(`Cannot edit a quote in status ${existing.status}`);
    }
    const maxOrder = await prisma.quoteLineItem.aggregate({
      where: { quoteId: id },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? 0) + 1;
    await prisma.quoteLineItem.create({
      data: {
        quoteId: id,
        sortOrder,
        productId: item.productId,
        name: item.name,
        description: item.description,
        quantity: item.quantity ?? 1,
        unitPrice: item.unitPrice ?? 0,
        discountBps: item.discountBps ?? 0,
        total: lineItemTotal(
          item.quantity ?? 1,
          item.unitPrice ?? 0,
          item.discountBps ?? 0,
        ),
      },
    });
    await this.logActivity(companyId, id, actor, {
      type: 'LINE_ITEM_ADDED',
      title: `Added "${item.name}"`,
      metadata: { name: item.name, quantity: item.quantity, unitPrice: item.unitPrice },
    });
    return this.recomputeAndReturn(companyId, id, actor);
  }

  async removeLineItem(
    companyId: string,
    id: string,
    actor: QuoteActor,
    lineItemId: string,
  ): Promise<Quote> {
    const existing = await this.getRaw(companyId, id);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(`Cannot edit a quote in status ${existing.status}`);
    }
    const li = await prisma.quoteLineItem.findFirst({
      where: { id: lineItemId, quoteId: id },
    });
    if (!li) throw new NotFoundException('Line item not found');
    await prisma.quoteLineItem.delete({ where: { id: lineItemId } });
    await this.logActivity(companyId, id, actor, {
      type: 'LINE_ITEM_REMOVED',
      title: `Removed "${li.name}"`,
      metadata: { name: li.name },
    });
    return this.recomputeAndReturn(companyId, id, actor);
  }

  async updateLineItem(
    companyId: string,
    id: string,
    actor: QuoteActor,
    lineItemId: string,
    patch: Partial<LineItemInput>,
  ): Promise<Quote> {
    const existing = await this.getRaw(companyId, id);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(`Cannot edit a quote in status ${existing.status}`);
    }
    const li = await prisma.quoteLineItem.findFirst({
      where: { id: lineItemId, quoteId: id },
    });
    if (!li) throw new NotFoundException('Line item not found');

    const data: Prisma.QuoteLineItemUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.productId !== undefined) data.productId = patch.productId;
    if (patch.quantity !== undefined) data.quantity = patch.quantity;
    if (patch.unitPrice !== undefined) data.unitPrice = patch.unitPrice;
    if (patch.discountBps !== undefined) data.discountBps = patch.discountBps;

    const q = patch.quantity ?? li.quantity;
    const p = patch.unitPrice ?? li.unitPrice;
    const d = patch.discountBps ?? li.discountBps;
    data.total = lineItemTotal(q, p, d);

    await prisma.quoteLineItem.update({ where: { id: lineItemId }, data });
    await this.logActivity(companyId, id, actor, {
      type: 'LINE_ITEM_UPDATED',
      title: `Updated "${li.name}"`,
      metadata: { fields: Object.keys(patch) },
    });
    return this.recomputeAndReturn(companyId, id, actor);
  }

  async send(
    companyId: string,
    id: string,
    actor: QuoteActor,
  ): Promise<Quote> {
    const existing = await this.getRaw(companyId, id);
    if (existing.status !== 'DRAFT' && existing.status !== 'SENT') {
      throw new BadRequestException(
        `Cannot send a quote in status ${existing.status}`,
      );
    }
    const lineItemCount = await prisma.quoteLineItem.count({ where: { quoteId: id } });
    if (lineItemCount === 0) {
      throw new BadRequestException('Add at least one line item before sending');
    }
    const updated = await prisma.quote.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: existing.sentAt ?? new Date(),
      },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    await this.logActivity(companyId, id, actor, {
      type: 'SENT',
      title: 'Quote sent',
      metadata: { lineItemCount },
    });
    return updated;
  }

  async revoke(
    companyId: string,
    id: string,
    actor: QuoteActor,
    reason?: string,
  ): Promise<Quote> {
    const existing = await this.getRaw(companyId, id);
    if (existing.status === 'ACCEPTED' || existing.status === 'REVOKED') {
      throw new BadRequestException(`Cannot revoke a quote in status ${existing.status}`);
    }
    const updated = await prisma.quote.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    await this.logActivity(companyId, id, actor, {
      type: 'REVOKED',
      title: 'Quote revoked',
      body: reason,
      metadata: { reason },
    });
    return updated;
  }

  /**
   * Mark a quote as viewed. Called from the public GET handler the first
   * time a customer hits the token URL.
   */
  async markViewed(token: string): Promise<void> {
    const quote = await prisma.quote.findUnique({
      where: { publicToken: token },
      select: { id: true, companyId: true, status: true },
    });
    if (!quote) return;
    if (quote.status !== 'SENT') return; // idempotent — only bump once
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: 'VIEWED', viewedAt: new Date() },
    });
    await this.logActivity(quote.companyId, quote.id, { type: 'public' }, {
      type: 'VIEWED_BY_CUSTOMER',
      title: 'Customer opened the quote',
    });
  }

  /**
   * Accept a quote (via public token or admin action). Optionally moves
   * the linked Deal to WON if `autoMoveDealOnAccept` is set.
   */
  async accept(
    companyId: string,
    id: string,
    actor: QuoteActor,
  ): Promise<Quote> {
    const existing = await this.getRaw(companyId, id);
    if (
      existing.status !== 'SENT' &&
      existing.status !== 'VIEWED'
    ) {
      throw new BadRequestException(
        `Only SENT or VIEWED quotes can be accepted (current: ${existing.status})`,
      );
    }
    const updated = await prisma.quote.update({
      where: { id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    await this.logActivity(companyId, id, actor, {
      type: 'ACCEPTED',
      title: 'Quote accepted',
      metadata: { total: updated.total },
    });

    // Optional deal auto-move
    if (existing.autoMoveDealOnAccept && existing.dealId) {
      try {
        await prisma.deal.update({
          where: { id: existing.dealId },
          data: { stage: 'WON', wonAt: new Date() },
        });
        await this.logActivity(companyId, id, { type: 'system' }, {
          type: 'DEAL_MOVED_TO_WON',
          title: `Linked deal moved to WON`,
          metadata: { dealId: existing.dealId },
        });
      } catch (err) {
        await this.logActivity(companyId, id, { type: 'system' }, {
          type: 'ERROR',
          title: 'Failed to auto-move deal to WON',
          body: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return updated;
  }

  async reject(
    companyId: string,
    id: string,
    actor: QuoteActor,
    reason?: string,
  ): Promise<Quote> {
    const existing = await this.getRaw(companyId, id);
    if (
      existing.status !== 'SENT' &&
      existing.status !== 'VIEWED'
    ) {
      throw new BadRequestException(
        `Only SENT or VIEWED quotes can be rejected (current: ${existing.status})`,
      );
    }
    const updated = await prisma.quote.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    await this.logActivity(companyId, id, actor, {
      type: 'REJECTED',
      title: 'Quote rejected',
      body: reason,
      metadata: { reason },
    });
    return updated;
  }

  async expire(
    companyId: string,
    id: string,
    actor: QuoteActor,
  ): Promise<Quote> {
    const existing = await this.getRaw(companyId, id);
    if (existing.status === 'ACCEPTED' || existing.status === 'REJECTED' || existing.status === 'EXPIRED') {
      return existing;
    }
    const updated = await prisma.quote.update({
      where: { id },
      data: { status: 'EXPIRED', expiredAt: new Date() },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    await this.logActivity(companyId, id, actor, {
      type: 'EXPIRED',
      title: 'Quote expired',
    });
    return updated;
  }

  async duplicate(
    companyId: string,
    id: string,
    actor: QuoteActor,
  ): Promise<Quote> {
    const src = await prisma.quote.findFirst({
      where: { id, companyId },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!src) throw new NotFoundException('Quote not found');

    const newNumber = await this.uniqueQuoteNumber(companyId);
    const newToken = randomBytes(16).toString('hex');

    const dup = await prisma.quote.create({
      data: {
        companyId,
        contactId: src.contactId,
        dealId: src.dealId,
        quoteNumber: newNumber,
        publicToken: newToken,
        title: src.title,
        description: src.description,
        subtotal: src.subtotal,
        tax: src.tax,
        taxBps: src.taxBps,
        discount: src.discount,
        total: src.total,
        currency: src.currency,
        notes: src.notes,
        terms: src.terms,
        tags: src.tags,
        autoMoveDealOnAccept: src.autoMoveDealOnAccept,
        createdByUserId: actor.type === 'user' ? actor.userId : null,
        lineItems: {
          create: src.lineItems.map((li) => ({
            sortOrder: li.sortOrder,
            productId: li.productId,
            name: li.name,
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            discountBps: li.discountBps,
            total: li.total,
          })),
        },
      },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    await this.logActivity(companyId, dup.id, actor, {
      type: 'DUPLICATED',
      title: `Duplicated from ${src.quoteNumber}`,
      metadata: { sourceQuoteId: src.id },
    });
    return dup;
  }

  async addNote(
    companyId: string,
    id: string,
    actor: QuoteActor,
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
    if (existing.status !== 'DRAFT' && existing.status !== 'REVOKED' && existing.status !== 'EXPIRED') {
      throw new BadRequestException(
        `Only DRAFT, REVOKED, or EXPIRED quotes can be deleted (current: ${existing.status})`,
      );
    }
    await prisma.quote.delete({ where: { id } });
  }

  // ── Bulk ops ──────────────────────────────────────────────────────────

  async bulkSend(
    companyId: string,
    ids: string[],
    actor: QuoteActor,
  ): Promise<BulkMutationResult> {
    return this.runBulk(ids, (id) => this.send(companyId, id, actor));
  }

  async bulkRevoke(
    companyId: string,
    ids: string[],
    actor: QuoteActor,
    reason?: string,
  ): Promise<BulkMutationResult> {
    return this.runBulk(ids, (id) => this.revoke(companyId, id, actor, reason));
  }

  async bulkDelete(
    companyId: string,
    ids: string[],
  ): Promise<BulkMutationResult> {
    return this.runBulk(ids, (id) => this.remove(companyId, id));
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async getRaw(companyId: string, id: string): Promise<Quote> {
    const record = await prisma.quote.findFirst({ where: { id, companyId } });
    if (!record) throw new NotFoundException('Quote not found');
    return record;
  }

  /** Recompute totals from current line items + persist them + return. */
  private async recomputeAndReturn(
    companyId: string,
    id: string,
    actor: QuoteActor,
  ): Promise<Quote> {
    const lineItems = await prisma.quoteLineItem.findMany({
      where: { quoteId: id },
      select: { quantity: true, unitPrice: true, discountBps: true },
    });
    const existing = await this.getRaw(companyId, id);
    const totals = computeQuoteTotals({
      lineItems,
      discount: existing.discount,
      taxBps: existing.taxBps,
    });
    const updated = await prisma.quote.update({
      where: { id },
      data: {
        subtotal: totals.subtotal,
        tax: totals.tax,
        discount: totals.discount,
        total: totals.total,
      },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    await this.logActivity(companyId, id, actor, {
      type: 'TOTALS_RECALCULATED',
      title: `Totals recomputed`,
      metadata: {
        subtotal: totals.subtotal,
        tax: totals.tax,
        discount: totals.discount,
        total: totals.total,
      },
    });
    return updated;
  }

  private async uniqueQuoteNumber(companyId: string): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const candidate = generateQuoteNumber();
      const existing = await prisma.quote.findUnique({
        where: { companyId_quoteNumber: { companyId, quoteNumber: candidate } },
      });
      if (!existing) return candidate;
    }
    // Fallback: append a longer random suffix
    return `Q-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
    quoteId: string,
    actor: QuoteActor,
    input: AddQuoteActivityInput,
  ) {
    return prisma.quoteActivity.create({
      data: {
        quoteId,
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

// Type-guard so unused imports don't trigger lint warnings
const _TYPE_GUARD: Array<QuoteActivityType | QuoteLineItem> = [];
void _TYPE_GUARD;

// ── Local helpers ───────────────────────────────────────────────────────

function safeDisplay(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.join(', ') || '[]';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
