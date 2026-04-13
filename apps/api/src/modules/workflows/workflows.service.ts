import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, WorkflowStatus, WorkflowActivityType } from '@wacrm/database';
import type {
  WorkflowActor, CreateWorkflowDto, UpdateWorkflowDto,
  ListWorkflowsFilters, WorkflowStatsSnapshot, BulkMutationResult,
} from './workflow.types';

@Injectable()
export class WorkflowsService {

  // ── Read ───────────────────────────────────────────────────────────────────

  async list(companyId: string, filters: ListWorkflowsFilters = {}) {
    const { page = 1, limit = 20, sort = 'recent', search, status, tags, triggerType } = filters;

    const where: Record<string, unknown> = { companyId };

    if (status) {
      where.status = Array.isArray(status) ? { in: status } : status;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (tags?.length) {
      where.tags = { hasSome: tags };
    }
    if (triggerType) {
      where.trigger = { path: ['type'], equals: triggerType };
    }

    const orderBy = sort === 'name' ? { name: 'asc' as const }
      : sort === 'runs' ? { runCount: 'desc' as const }
      : sort === 'errors' ? { errorCount: 'desc' as const }
      : { createdAt: 'desc' as const };

    const [total, items] = await Promise.all([
      prisma.workflow.count({ where: where as never }),
      prisma.workflow.findMany({
        where: where as never,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { executions: true } } },
      }),
    ]);

    return { total, page, limit, items };
  }

  async get(companyId: string, id: string) {
    const workflow = await prisma.workflow.findFirst({
      where: { id, companyId },
      include: { _count: { select: { executions: true } } },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');
    return workflow;
  }

  async getTimeline(companyId: string, workflowId: string) {
    await this.get(companyId, workflowId);
    return prisma.workflowActivity.findMany({
      where: { workflowId, companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getExecutions(companyId: string, workflowId: string, limit = 20) {
    await this.get(companyId, workflowId);
    return prisma.workflowExecution.findMany({
      where: { workflowId, companyId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  // kept for backward compat
  async listExecutions(companyId: string, workflowId: string) {
    return this.getExecutions(companyId, workflowId);
  }

  async stats(companyId: string): Promise<WorkflowStatsSnapshot> {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [byStatus, runsLast7d, failuresLast7d] = await Promise.all([
      prisma.workflow.groupBy({
        by: ['status'],
        where: { companyId },
        _count: true,
      }),
      prisma.workflowExecution.count({
        where: { companyId, startedAt: { gte: since7d } },
      }),
      prisma.workflowExecution.count({
        where: { companyId, status: 'FAILED', startedAt: { gte: since7d } },
      }),
    ]);

    const countByStatus = Object.fromEntries(byStatus.map(r => [r.status, r._count]));

    return {
      total: byStatus.reduce((s, r) => s + r._count, 0),
      active: countByStatus['ACTIVE'] ?? 0,
      paused: countByStatus['PAUSED'] ?? 0,
      draft: countByStatus['DRAFT'] ?? 0,
      archived: countByStatus['ARCHIVED'] ?? 0,
      runsLast7d,
      failuresLast7d,
    };
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreateWorkflowDto, actor: WorkflowActor) {
    const existing = await prisma.workflow.findFirst({ where: { companyId, name: dto.name } });
    if (existing) throw new BadRequestException(`A workflow named "${dto.name}" already exists`);

    const workflow = await prisma.workflow.create({
      data: {
        companyId,
        name: dto.name,
        description: dto.description,
        trigger: (dto.trigger ?? {}) as never,
        steps: (dto.steps ?? []) as never,
        tags: dto.tags ?? [],
        status: 'DRAFT',
        isActive: false,
        createdByUserId: actor.id,
      },
    });

    await this.logActivity(workflow.id, companyId, 'CREATED', actor, `Workflow "${workflow.name}" created`);
    return workflow;
  }

  async update(companyId: string, id: string, dto: UpdateWorkflowDto, actor: WorkflowActor) {
    const workflow = await this.get(companyId, id);

    const updated = await prisma.workflow.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.trigger && { trigger: dto.trigger as never }),
        ...(dto.steps && { steps: dto.steps as never }),
        ...(dto.tags && { tags: dto.tags }),
      },
    });

    await this.logActivity(id, companyId, 'UPDATED', actor, `Workflow "${workflow.name}" updated`);
    return updated;
  }

  async activate(companyId: string, id: string, actor: WorkflowActor) {
    const workflow = await this.get(companyId, id);
    if (workflow.status === 'ACTIVE') throw new BadRequestException('Workflow is already active');
    if (workflow.status === 'ARCHIVED') throw new BadRequestException('Restore the workflow before activating');

    const updated = await prisma.workflow.update({
      where: { id },
      data: { status: 'ACTIVE', isActive: true, publishedAt: workflow.publishedAt ?? new Date() },
    });

    await this.logActivity(id, companyId, 'ACTIVATED', actor, `Workflow "${workflow.name}" activated`);
    return updated;
  }

  async pause(companyId: string, id: string, actor: WorkflowActor) {
    const workflow = await this.get(companyId, id);
    if (workflow.status !== 'ACTIVE') throw new BadRequestException('Only ACTIVE workflows can be paused');

    const updated = await prisma.workflow.update({
      where: { id },
      data: { status: 'PAUSED', isActive: false },
    });

    await this.logActivity(id, companyId, 'PAUSED', actor, `Workflow "${workflow.name}" paused`);
    return updated;
  }

  async archive(companyId: string, id: string, actor: WorkflowActor) {
    const workflow = await this.get(companyId, id);

    await prisma.workflow.update({
      where: { id },
      data: { status: 'ARCHIVED', isActive: false },
    });

    await this.logActivity(id, companyId, 'ARCHIVED', actor, `Workflow "${workflow.name}" archived`);
    return { ok: true };
  }

  async restore(companyId: string, id: string, actor: WorkflowActor) {
    const workflow = await this.get(companyId, id);
    if (workflow.status !== 'ARCHIVED') throw new BadRequestException('Only ARCHIVED workflows can be restored');

    const updated = await prisma.workflow.update({
      where: { id },
      data: { status: 'DRAFT', isActive: false },
    });

    await this.logActivity(id, companyId, 'RESTORED', actor, `Workflow "${workflow.name}" restored to DRAFT`);
    return updated;
  }

  async duplicate(companyId: string, id: string, actor: WorkflowActor) {
    const workflow = await this.get(companyId, id);

    const copy = await prisma.workflow.create({
      data: {
        companyId,
        name: `${workflow.name} (copy)`,
        description: workflow.description,
        trigger: workflow.trigger as never,
        steps: workflow.steps as never,
        tags: workflow.tags,
        status: 'DRAFT',
        isActive: false,
        createdByUserId: actor.id,
      },
    });

    await this.logActivity(copy.id, companyId, 'CREATED', actor, `Duplicated from "${workflow.name}"`);
    return copy;
  }

  async addNote(companyId: string, id: string, note: string, actor: WorkflowActor) {
    await this.get(companyId, id);
    await this.logActivity(id, companyId, 'NOTE_ADDED', actor, note);
    return { ok: true };
  }

  async run(companyId: string, id: string, actor: WorkflowActor) {
    const workflow = await this.get(companyId, id);

    const execution = await prisma.workflowExecution.create({
      data: { workflowId: id, companyId, status: 'RUNNING', steps: [] },
    });

    await prisma.workflow.update({
      where: { id },
      data: { runCount: { increment: 1 }, lastRunAt: new Date() },
    });

    await this.logActivity(id, companyId, 'EXECUTED', actor, `Manual run triggered for "${workflow.name}"`);
    return execution;
  }

  async remove(companyId: string, id: string, actor: WorkflowActor) {
    const workflow = await this.get(companyId, id);
    await prisma.workflow.delete({ where: { id } });
    await this.logActivity(id, companyId, 'ARCHIVED', actor, `Workflow "${workflow.name}" deleted`).catch(() => {});
    return { ok: true };
  }

  // ── Bulk ───────────────────────────────────────────────────────────────────

  async bulkActivate(companyId: string, ids: string[], actor: WorkflowActor): Promise<BulkMutationResult> {
    return this._bulkStatus(companyId, ids, 'ACTIVE', true, 'ACTIVATED', actor);
  }

  async bulkPause(companyId: string, ids: string[], actor: WorkflowActor): Promise<BulkMutationResult> {
    return this._bulkStatus(companyId, ids, 'PAUSED', false, 'PAUSED', actor);
  }

  async bulkArchive(companyId: string, ids: string[], actor: WorkflowActor): Promise<BulkMutationResult> {
    return this._bulkStatus(companyId, ids, 'ARCHIVED', false, 'ARCHIVED', actor);
  }

  async bulkDelete(companyId: string, ids: string[], actor: WorkflowActor): Promise<BulkMutationResult> {
    const result = await prisma.workflow.deleteMany({ where: { companyId, id: { in: ids } } });
    for (const id of ids) {
      await this.logActivity(id, companyId, 'ARCHIVED', actor, 'Bulk deleted').catch(() => {});
    }
    return { updated: result.count, failed: ids.length - result.count };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async _bulkStatus(
    companyId: string, ids: string[], status: WorkflowStatus, isActive: boolean,
    activityType: WorkflowActivityType, actor: WorkflowActor,
  ): Promise<BulkMutationResult> {
    const result = await prisma.workflow.updateMany({
      where: { companyId, id: { in: ids } },
      data: { status, isActive },
    });
    for (const id of ids) {
      await this.logActivity(id, companyId, activityType, actor, `Bulk ${status.toLowerCase()}`).catch(() => {});
    }
    return { updated: result.count, failed: ids.length - result.count };
  }

  private async logActivity(
    workflowId: string, companyId: string, type: WorkflowActivityType,
    actor: WorkflowActor, title: string, meta?: Record<string, unknown>,
  ) {
    return prisma.workflowActivity.create({
      data: {
        workflowId,
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
