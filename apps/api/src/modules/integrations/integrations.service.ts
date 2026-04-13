import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, IntegrationType, IntegrationStatus, IntegrationActivityType } from '@wacrm/database';
import type {
  IntegrationActor, CreateIntegrationDto, UpdateIntegrationDto,
  IntegrationStatsSnapshot, CreateCalendarEventDto, UpdateCalendarEventDto, BulkMutationResult,
} from './integration.types';

@Injectable()
export class IntegrationsService {

  // ── Read ───────────────────────────────────────────────────────────────────

  async list(companyId: string, filters: { type?: string; status?: string } = {}) {
    const where: Record<string, unknown> = { companyId };
    if (filters.type) where.type = filters.type as IntegrationType;
    if (filters.status) where.status = filters.status as IntegrationStatus;
    return prisma.integration.findMany({ where: where as any, orderBy: { createdAt: 'desc' } });
  }

  async get(companyId: string, id: string) {
    const record = await prisma.integration.findFirst({ where: { id, companyId } });
    if (!record) throw new NotFoundException('Integration not found');
    return record;
  }

  async getTimeline(companyId: string, integrationId: string) {
    await this.get(companyId, integrationId);
    return prisma.integrationActivity.findMany({
      where: { integrationId, companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getWebhookLogs(companyId: string, integrationId: string, limit = 20) {
    await this.get(companyId, integrationId);
    return prisma.webhookLog.findMany({
      where: { companyId, integrationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async stats(companyId: string): Promise<IntegrationStatsSnapshot> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [byStatus, webhookLogs24h] = await Promise.all([
      prisma.integration.groupBy({
        by: ['status'],
        where: { companyId },
        _count: true,
      }),
      prisma.webhookLog.count({
        where: { companyId, createdAt: { gte: since24h } },
      }),
    ]);

    const countByStatus = Object.fromEntries(byStatus.map(r => [r.status, r._count]));

    return {
      total: byStatus.reduce((s, r) => s + r._count, 0),
      connected: countByStatus['CONNECTED'] ?? 0,
      disconnected: countByStatus['DISCONNECTED'] ?? 0,
      error: countByStatus['ERROR'] ?? 0,
      syncing: countByStatus['SYNCING'] ?? 0,
      webhookLogs24h,
    };
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreateIntegrationDto, actor?: IntegrationActor) {
    const integration = await prisma.integration.create({
      data: {
        companyId,
        type: dto.type,
        name: dto.name,
        config: (dto.config ?? {}) as never,
        webhookUrl: dto.webhookUrl,
        webhookSecret: dto.webhookSecret,
        status: 'DISCONNECTED',
      },
    });

    if (actor) {
      await this.logActivity(integration.id, companyId, 'CONFIGURED', actor, `Integration "${dto.type}" created`);
    }
    return integration;
  }

  async update(companyId: string, id: string, dto: UpdateIntegrationDto, actor?: IntegrationActor) {
    const integration = await this.get(companyId, id);

    const updated = await prisma.integration.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.config && { config: dto.config as never }),
        ...(dto.webhookUrl !== undefined && { webhookUrl: dto.webhookUrl }),
        ...(dto.webhookSecret !== undefined && { webhookSecret: dto.webhookSecret }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    if (actor) {
      await this.logActivity(id, companyId, 'CONFIGURED', actor, `Integration "${integration.type}" updated`);
    }
    return updated;
  }

  async connect(companyId: string, id: string, actor: IntegrationActor) {
    const integration = await this.get(companyId, id);
    if (integration.status === 'CONNECTED') throw new BadRequestException('Integration is already connected');

    const updated = await prisma.integration.update({
      where: { id },
      data: { status: 'CONNECTED', isActive: true, lastError: null },
    });

    await this.logActivity(id, companyId, 'CONNECTED', actor, `Integration "${integration.type}" connected`);
    return updated;
  }

  async disconnect(companyId: string, id: string, actor: IntegrationActor) {
    const integration = await this.get(companyId, id);

    const updated = await prisma.integration.update({
      where: { id },
      data: { status: 'DISCONNECTED', isActive: false },
    });

    await this.logActivity(id, companyId, 'DISCONNECTED', actor, `Integration "${integration.type}" disconnected`);
    return updated;
  }

  async testConnection(companyId: string, id: string, actor: IntegrationActor) {
    const integration = await this.get(companyId, id);

    // Simulate a test — in production this would ping the external service
    const success = integration.status === 'CONNECTED';
    const message = success ? `Connection to ${integration.type} is healthy` : `Not connected to ${integration.type}`;

    await this.logActivity(id, companyId, success ? 'CONNECTED' : 'ERROR', actor, `Connection test: ${message}`);
    return { success, message };
  }

  async sync(companyId: string, id: string, actor: IntegrationActor) {
    const integration = await this.get(companyId, id);

    await prisma.integration.update({
      where: { id },
      data: { status: 'SYNCING', lastSyncAt: new Date(), syncCount: { increment: 1 } },
    });

    // Simulate sync completion
    setTimeout(async () => {
      await prisma.integration.update({ where: { id }, data: { status: 'CONNECTED' } }).catch(() => {});
    }, 2000);

    await this.logActivity(id, companyId, 'SYNCED', actor, `Sync triggered for "${integration.type}"`);
    return { ok: true, message: `Sync started for ${integration.type}` };
  }

  async remove(companyId: string, id: string, actor?: IntegrationActor) {
    const integration = await this.get(companyId, id);
    await prisma.integration.delete({ where: { id } });
    if (actor) {
      await this.logActivity(id, companyId, 'DISCONNECTED', actor, `Integration "${integration.type}" deleted`).catch(() => {});
    }
    return { ok: true };
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  async triggerWebhook(companyId: string, integrationId: string, payload: Record<string, unknown>, actor: IntegrationActor) {
    const integration = await this.get(companyId, integrationId);
    if (!integration.webhookUrl) throw new BadRequestException('Integration has no webhookUrl configured');

    const start = Date.now();
    let statusCode = 200;
    let responseBody: unknown = null;

    try {
      const res = await fetch(integration.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(integration.webhookSecret ? { 'X-Webhook-Secret': integration.webhookSecret } : {}) },
        body: JSON.stringify(payload),
      });
      statusCode = res.status;
      responseBody = await res.text().catch(() => null);
    } catch (err: any) {
      statusCode = 0;
      responseBody = err.message;
    }

    const latencyMs = Date.now() - start;

    await prisma.webhookLog.create({
      data: {
        companyId,
        integrationId,
        direction: 'OUTBOUND',
        url: integration.webhookUrl,
        method: 'POST',
        statusCode,
        requestBody: payload as never,
        responseBody: responseBody as never,
        latencyMs,
      },
    });

    await this.logActivity(integrationId, companyId, 'WEBHOOK_SENT', actor,
      `Webhook sent to ${integration.webhookUrl} — status ${statusCode}`);

    return { statusCode, latencyMs };
  }

  // ── Bulk ───────────────────────────────────────────────────────────────────

  async bulkDisconnect(companyId: string, ids: string[], actor: IntegrationActor): Promise<BulkMutationResult> {
    const result = await prisma.integration.updateMany({
      where: { companyId, id: { in: ids } },
      data: { status: 'DISCONNECTED', isActive: false },
    });
    for (const id of ids) {
      await this.logActivity(id, companyId, 'DISCONNECTED', actor, 'Bulk disconnected').catch(() => {});
    }
    return { updated: result.count, failed: ids.length - result.count };
  }

  async bulkDelete(companyId: string, ids: string[], actor: IntegrationActor): Promise<BulkMutationResult> {
    const result = await prisma.integration.deleteMany({ where: { companyId, id: { in: ids } } });
    for (const id of ids) {
      await this.logActivity(id, companyId, 'DISCONNECTED', actor, 'Bulk deleted').catch(() => {});
    }
    return { updated: result.count, failed: ids.length - result.count };
  }

  // ── Calendar ───────────────────────────────────────────────────────────────

  async listCalendarEvents(companyId: string, filters: { from?: string; to?: string } = {}) {
    const where: any = { companyId };
    if (filters.from || filters.to) {
      where.startAt = {};
      if (filters.from) where.startAt.gte = new Date(filters.from);
      if (filters.to) where.startAt.lte = new Date(filters.to);
    }
    return prisma.calendarEvent.findMany({ where, orderBy: { startAt: 'asc' } });
  }

  async createCalendarEvent(companyId: string, dto: CreateCalendarEventDto) {
    return prisma.calendarEvent.create({
      data: {
        companyId,
        title: dto.title,
        description: dto.description,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        location: dto.location,
        contactId: dto.contactId,
        dealId: dto.dealId,
      },
    });
  }

  async updateCalendarEvent(companyId: string, eventId: string, dto: UpdateCalendarEventDto) {
    const record = await prisma.calendarEvent.findFirst({ where: { id: eventId, companyId } });
    if (!record) throw new NotFoundException('Calendar event not found');
    return prisma.calendarEvent.update({
      where: { id: eventId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.startAt && { startAt: new Date(dto.startAt) }),
        ...(dto.endAt && { endAt: new Date(dto.endAt) }),
        ...(dto.location !== undefined && { location: dto.location }),
      },
    });
  }

  async deleteCalendarEvent(companyId: string, eventId: string) {
    const record = await prisma.calendarEvent.findFirst({ where: { id: eventId, companyId } });
    if (!record) throw new NotFoundException('Calendar event not found');
    return prisma.calendarEvent.delete({ where: { id: eventId } });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async logActivity(
    integrationId: string, companyId: string, type: IntegrationActivityType,
    actor: IntegrationActor, title: string, meta?: Record<string, unknown>,
  ) {
    return prisma.integrationActivity.create({
      data: {
        integrationId,
        companyId,
        type,
        actorType: actor.type,
        actorId: actor.id,
        title,
        meta: meta as never,
      },
    });
  }
}
