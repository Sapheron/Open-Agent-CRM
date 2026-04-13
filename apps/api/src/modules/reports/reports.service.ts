import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, ReportActivityType } from '@wacrm/database';
import type {
  ReportActor, CreateReportDto, UpdateReportDto,
  ListReportsFilters, ReportStatsSnapshot, RunReportResult, BulkMutationResult,
} from './report.types';

@Injectable()
export class ReportsService {

  // ── Read ───────────────────────────────────────────────────────────────────

  async list(companyId: string, filters: ListReportsFilters = {}) {
    const { page = 1, limit = 20, sort = 'recent', search, status, type, entity } = filters;

    const where: Record<string, unknown> = { companyId };
    if (status) {
      where.status = Array.isArray(status) ? { in: status } : status;
    }
    if (type) where.type = type;
    if (entity) where.entity = entity;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy = sort === 'name' ? { name: 'asc' as const }
      : { createdAt: 'desc' as const };

    const [total, items] = await Promise.all([
      prisma.customReport.count({ where: where as never }),
      prisma.customReport.findMany({
        where: where as never,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { total, page, limit, items };
  }

  async get(companyId: string, id: string) {
    const report = await prisma.customReport.findFirst({ where: { id, companyId } });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  async getTimeline(companyId: string, reportId: string) {
    await this.get(companyId, reportId);
    return prisma.reportActivity.findMany({
      where: { reportId, companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async stats(companyId: string): Promise<ReportStatsSnapshot> {
    const [byStatus, scheduled] = await Promise.all([
      prisma.customReport.groupBy({ by: ['status'], where: { companyId }, _count: true }),
      prisma.scheduledReport.count({ where: { companyId, isActive: true } }),
    ]);

    const countByStatus = Object.fromEntries(byStatus.map(r => [r.status, r._count]));

    return {
      total: byStatus.reduce((s, r) => s + r._count, 0),
      active: countByStatus['ACTIVE'] ?? 0,
      draft: countByStatus['DRAFT'] ?? 0,
      archived: countByStatus['ARCHIVED'] ?? 0,
      scheduled,
      totalRuns: 0, // would need a runs counter column
    };
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreateReportDto, actor: ReportActor) {
    const report = await prisma.customReport.create({
      data: {
        companyId,
        name: dto.name,
        entity: dto.entity,
        type: dto.type ?? 'TABLE',
        description: dto.description,
        tags: dto.tags ?? [],
        filters: (dto.filters ?? {}) as never,
        groupBy: dto.groupBy,
        columns: dto.columns ?? [],
        isPublic: dto.isPublic ?? false,
        notes: dto.notes,
        status: 'DRAFT',
        createdByUserId: actor.id,
      },
    });

    await this.logActivity(report.id, companyId, 'CREATED', actor, `Report "${report.name}" created`);
    return report;
  }

  async update(companyId: string, id: string, dto: UpdateReportDto, actor: ReportActor) {
    const report = await this.get(companyId, id);

    const updated = await prisma.customReport.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.entity && { entity: dto.entity }),
        ...(dto.type && { type: dto.type }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.tags && { tags: dto.tags }),
        ...(dto.filters && { filters: dto.filters as never }),
        ...(dto.groupBy !== undefined && { groupBy: dto.groupBy }),
        ...(dto.columns && { columns: dto.columns }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });

    await this.logActivity(id, companyId, 'UPDATED', actor, `Report "${report.name}" updated`);
    return updated;
  }

  async archive(companyId: string, id: string, actor: ReportActor) {
    const report = await this.get(companyId, id);
    await prisma.customReport.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await this.logActivity(id, companyId, 'ARCHIVED', actor, `Report "${report.name}" archived`);
    return { ok: true };
  }

  async restore(companyId: string, id: string, actor: ReportActor) {
    const report = await this.get(companyId, id);
    if (report.status !== 'ARCHIVED') throw new BadRequestException('Only ARCHIVED reports can be restored');
    const updated = await prisma.customReport.update({ where: { id }, data: { status: 'DRAFT' } });
    await this.logActivity(id, companyId, 'RESTORED', actor, `Report "${report.name}" restored`);
    return updated;
  }

  async duplicate(companyId: string, id: string, actor: ReportActor) {
    const report = await this.get(companyId, id);
    const copy = await prisma.customReport.create({
      data: {
        companyId,
        name: `${report.name} (copy)`,
        entity: report.entity,
        type: report.type,
        description: report.description ?? undefined,
        tags: report.tags,
        filters: report.filters as never,
        groupBy: report.groupBy ?? undefined,
        columns: report.columns,
        isPublic: false,
        status: 'DRAFT',
        createdByUserId: actor.id,
      },
    });
    await this.logActivity(copy.id, companyId, 'CREATED', actor, `Duplicated from "${report.name}"`);
    return copy;
  }

  async addNote(companyId: string, id: string, note: string, actor: ReportActor) {
    await this.get(companyId, id);
    await this.logActivity(id, companyId, 'NOTE_ADDED', actor, note);
    return { ok: true };
  }

  async remove(companyId: string, id: string, actor: ReportActor) {
    const report = await this.get(companyId, id);
    await prisma.customReport.delete({ where: { id } });
    await this.logActivity(id, companyId, 'UPDATED', actor, `Report "${report.name}" deleted`).catch(() => {});
    return { ok: true };
  }

  // ── Run ────────────────────────────────────────────────────────────────────

  async run(companyId: string, id: string, actor: ReportActor): Promise<RunReportResult> {
    const report = await this.get(companyId, id);
    const filters = (report.filters ?? {}) as Record<string, unknown>;

    const rows = await this._executeQuery(companyId, report.entity, filters, report.columns ?? [], report.groupBy ?? undefined);

    const result = JSON.stringify(rows, null, 2);
    await prisma.customReport.update({
      where: { id },
      data: { lastRunAt: new Date(), lastRunResult: result as never },
    });

    await this.logActivity(id, companyId, 'RUN', actor, `Report "${report.name}" executed — ${rows.length} rows`);

    return {
      reportId: id,
      entity: report.entity,
      total: rows.length,
      rows,
      runAt: new Date().toISOString(),
    };
  }

  // ── Schedule ───────────────────────────────────────────────────────────────

  async schedule(companyId: string, reportId: string, data: { frequency?: string; recipients: string[]; isActive?: boolean }, actor: ReportActor) {
    await this.get(companyId, reportId);
    const scheduled = await prisma.scheduledReport.create({
      data: {
        companyId,
        reportId,
        frequency: data.frequency ?? 'WEEKLY',
        recipients: data.recipients,
        isActive: data.isActive ?? true,
      },
    });
    await this.logActivity(reportId, companyId, 'SCHEDULED', actor, `Report scheduled (${data.frequency ?? 'WEEKLY'}) to ${data.recipients.join(', ')}`);
    return scheduled;
  }

  async unschedule(companyId: string, scheduleId: string, actor: ReportActor) {
    const schedule = await prisma.scheduledReport.findFirst({ where: { id: scheduleId, companyId } });
    if (!schedule) throw new NotFoundException('Schedule not found');
    await prisma.scheduledReport.delete({ where: { id: scheduleId } });
    await this.logActivity(schedule.reportId, companyId, 'SCHEDULED', actor, `Schedule removed`);
    return { ok: true };
  }

  async listScheduled(companyId: string) {
    return prisma.scheduledReport.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { report: { select: { name: true, entity: true } } },
    });
  }

  // ── Bulk ───────────────────────────────────────────────────────────────────

  async bulkArchive(companyId: string, ids: string[], actor: ReportActor): Promise<BulkMutationResult> {
    const result = await prisma.customReport.updateMany({
      where: { companyId, id: { in: ids } },
      data: { status: 'ARCHIVED' },
    });
    for (const id of ids) {
      await this.logActivity(id, companyId, 'ARCHIVED', actor, 'Bulk archived').catch(() => {});
    }
    return { updated: result.count, failed: ids.length - result.count };
  }

  async bulkDelete(companyId: string, ids: string[], actor: ReportActor): Promise<BulkMutationResult> {
    const result = await prisma.customReport.deleteMany({ where: { companyId, id: { in: ids } } });
    for (const id of ids) {
      await this.logActivity(id, companyId, 'UPDATED', actor, 'Bulk deleted').catch(() => {});
    }
    return { updated: result.count, failed: ids.length - result.count };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async _executeQuery(
    companyId: string,
    entity: string,
    filters: Record<string, unknown>,
    _columns: string[],
    _groupBy?: string,
  ): Promise<unknown[]> {
    const where: Record<string, unknown> = { companyId, ...filters };
    const limit = 500;

    switch (entity.toLowerCase()) {
      case 'contacts':
        return prisma.contact.findMany({ where: where as any, take: limit, orderBy: { createdAt: 'desc' } });
      case 'leads':
        return prisma.lead.findMany({ where: where as any, take: limit, orderBy: { createdAt: 'desc' } });
      case 'deals':
        return prisma.deal.findMany({ where: where as any, take: limit, orderBy: { createdAt: 'desc' } });
      case 'tickets':
        return prisma.ticket.findMany({ where: where as any, take: limit, orderBy: { createdAt: 'desc' } });
      case 'invoices':
        return prisma.invoice.findMany({ where: where as any, take: limit, orderBy: { createdAt: 'desc' } });
      case 'payments':
        return prisma.payment.findMany({ where: where as any, take: limit, orderBy: { createdAt: 'desc' } });
      case 'tasks':
        return prisma.task.findMany({ where: where as any, take: limit, orderBy: { createdAt: 'desc' } });
      default:
        throw new BadRequestException(`Unknown entity: ${entity}. Valid: contacts, leads, deals, tickets, invoices, payments, tasks`);
    }
  }

  private async logActivity(
    reportId: string, companyId: string, type: ReportActivityType,
    actor: ReportActor, title: string, meta?: Record<string, unknown>,
  ) {
    return prisma.reportActivity.create({
      data: {
        reportId,
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
