import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, DocumentSignatureStatus, DocumentActivityType } from '@wacrm/database';
import type {
  DocumentActor, CreateDocumentDto, UpdateDocumentDto,
  ListDocumentsFilters, DocumentStatsSnapshot, BulkMutationResult,
} from './document.types';

@Injectable()
export class DocumentsService {

  // ── Read ───────────────────────────────────────────────────────────────────

  async list(companyId: string, filters: ListDocumentsFilters = {}) {
    const { page = 1, limit = 20, sort = 'recent', search, type, status, contactId, dealId, isTemplate } = filters;

    const where: Record<string, unknown> = { companyId };

    if (status) {
      where.status = Array.isArray(status) ? { in: status } : status;
    }
    if (type) where.type = type;
    if (contactId) where.contactId = contactId;
    if (dealId) where.dealId = dealId;
    if (isTemplate !== undefined) where.isTemplate = isTemplate;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy = sort === 'name' ? { name: 'asc' as const }
      : sort === 'size' ? { fileSize: 'desc' as const }
      : { createdAt: 'desc' as const };

    const [total, items] = await Promise.all([
      prisma.document.count({ where: where as never }),
      prisma.document.findMany({
        where: where as never,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: { signatures: true, _count: { select: { signatures: true } } },
      }),
    ]);

    return { total, page, limit, items };
  }

  async get(companyId: string, id: string) {
    const doc = await prisma.document.findFirst({
      where: { id, companyId },
      include: { signatures: true, _count: { select: { signatures: true } } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async getTimeline(companyId: string, documentId: string) {
    await this.get(companyId, documentId);
    return prisma.documentActivity.findMany({
      where: { documentId, companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getSignatures(companyId: string, documentId: string) {
    await this.get(companyId, documentId);
    return prisma.documentSignature.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async stats(companyId: string): Promise<DocumentStatsSnapshot> {
    const [byStatus, templates, pendingSignatures, signedTotal] = await Promise.all([
      prisma.document.groupBy({
        by: ['status'],
        where: { companyId },
        _count: true,
      }),
      prisma.document.count({ where: { companyId, isTemplate: true } }),
      prisma.documentSignature.count({
        where: { document: { companyId }, status: 'PENDING' },
      }),
      prisma.documentSignature.count({
        where: { document: { companyId }, status: 'SIGNED' },
      }),
    ]);

    const countByStatus = Object.fromEntries(byStatus.map(r => [r.status, r._count]));

    return {
      total: byStatus.reduce((s, r) => s + r._count, 0),
      active: countByStatus['ACTIVE'] ?? 0,
      draft: countByStatus['DRAFT'] ?? 0,
      archived: countByStatus['ARCHIVED'] ?? 0,
      templates,
      pendingSignatures,
      signedTotal,
    };
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreateDocumentDto, actor: DocumentActor) {
    const doc = await prisma.document.create({
      data: {
        companyId,
        name: dto.name,
        type: dto.type,
        fileUrl: dto.fileUrl,
        fileSize: dto.fileSize,
        mimeType: dto.mimeType,
        description: dto.description,
        tags: dto.tags ?? [],
        contactId: dto.contactId,
        dealId: dto.dealId,
        isTemplate: dto.isTemplate ?? false,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        notes: dto.notes,
        status: 'DRAFT',
        createdByUserId: actor.id,
      },
      include: { signatures: true },
    });

    await this.logActivity(doc.id, companyId, 'CREATED', actor, `Document "${doc.name}" created`);
    return doc;
  }

  async update(companyId: string, id: string, dto: UpdateDocumentDto, actor: DocumentActor) {
    const doc = await this.get(companyId, id);

    const updated = await prisma.document.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.type && { type: dto.type }),
        ...(dto.fileUrl && { fileUrl: dto.fileUrl }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.tags && { tags: dto.tags }),
        ...(dto.isTemplate !== undefined && { isTemplate: dto.isTemplate }),
        ...(dto.expiresAt && { expiresAt: new Date(dto.expiresAt) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        version: { increment: 1 },
      },
      include: { signatures: true },
    });

    await this.logActivity(id, companyId, 'UPDATED', actor, `Document "${doc.name}" updated`);
    return updated;
  }

  async archive(companyId: string, id: string, actor: DocumentActor) {
    const doc = await this.get(companyId, id);

    await prisma.document.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    await this.logActivity(id, companyId, 'ARCHIVED', actor, `Document "${doc.name}" archived`);
    return { ok: true };
  }

  async restore(companyId: string, id: string, actor: DocumentActor) {
    const doc = await this.get(companyId, id);
    if (doc.status !== 'ARCHIVED') throw new BadRequestException('Only ARCHIVED documents can be restored');

    const updated = await prisma.document.update({
      where: { id },
      data: { status: 'DRAFT' },
      include: { signatures: true },
    });

    await this.logActivity(id, companyId, 'RESTORED', actor, `Document "${doc.name}" restored`);
    return updated;
  }

  async duplicate(companyId: string, id: string, actor: DocumentActor) {
    const doc = await this.get(companyId, id);

    const copy = await prisma.document.create({
      data: {
        companyId,
        name: `${doc.name} (copy)`,
        type: doc.type,
        fileUrl: doc.fileUrl,
        fileSize: doc.fileSize ?? undefined,
        mimeType: doc.mimeType ?? undefined,
        description: doc.description ?? undefined,
        tags: doc.tags,
        contactId: doc.contactId ?? undefined,
        dealId: doc.dealId ?? undefined,
        isTemplate: doc.isTemplate,
        status: 'DRAFT',
        createdByUserId: actor.id,
      },
      include: { signatures: true },
    });

    await this.logActivity(copy.id, companyId, 'CREATED', actor, `Duplicated from "${doc.name}"`);
    return copy;
  }

  async addNote(companyId: string, id: string, note: string, actor: DocumentActor) {
    await this.get(companyId, id);
    await this.logActivity(id, companyId, 'NOTE_ADDED', actor, note);
    return { ok: true };
  }

  async remove(companyId: string, id: string, actor: DocumentActor) {
    const doc = await this.get(companyId, id);
    await prisma.document.delete({ where: { id } });
    await this.logActivity(id, companyId, 'DELETED', actor, `Document "${doc.name}" deleted`).catch(() => {});
    return { ok: true };
  }

  // ── Signatures ─────────────────────────────────────────────────────────────

  async requestSignature(companyId: string, documentId: string, data: { signerName: string; signerEmail?: string }, actor: DocumentActor) {
    const doc = await this.get(companyId, documentId);

    const sig = await prisma.documentSignature.create({
      data: { documentId, signerName: data.signerName, signerEmail: data.signerEmail },
    });

    await this.logActivity(documentId, companyId, 'SIGNATURE_REQUESTED', actor, `Signature requested from ${data.signerName}`);

    if (doc.status === 'DRAFT') {
      await prisma.document.update({ where: { id: documentId }, data: { status: 'ACTIVE' } });
    }

    return sig;
  }

  async updateSignature(companyId: string, documentId: string, signatureId: string, data: { status: string }, actor: DocumentActor) {
    await this.get(companyId, documentId);

    const signature = await prisma.documentSignature.findFirst({ where: { id: signatureId, documentId } });
    if (!signature) throw new NotFoundException('Signature not found');

    const status = data.status as DocumentSignatureStatus;
    const updated = await prisma.documentSignature.update({
      where: { id: signatureId },
      data: {
        status,
        ...(status === 'SIGNED' ? { signedAt: new Date() } : {}),
      },
    });

    const activityType: DocumentActivityType = status === 'SIGNED' ? 'SIGNATURE_RECEIVED'
      : status === 'DECLINED' ? 'SIGNATURE_DECLINED' : 'UPDATED' as any;
    await this.logActivity(documentId, companyId, activityType, actor, `Signature ${status.toLowerCase()} by ${signature.signerName}`);
    return updated;
  }

  // ── Bulk ───────────────────────────────────────────────────────────────────

  async bulkArchive(companyId: string, ids: string[], actor: DocumentActor): Promise<BulkMutationResult> {
    const result = await prisma.document.updateMany({
      where: { companyId, id: { in: ids } },
      data: { status: 'ARCHIVED' },
    });
    for (const id of ids) {
      await this.logActivity(id, companyId, 'ARCHIVED', actor, 'Bulk archived').catch(() => {});
    }
    return { updated: result.count, failed: ids.length - result.count };
  }

  async bulkDelete(companyId: string, ids: string[], actor: DocumentActor): Promise<BulkMutationResult> {
    const result = await prisma.document.deleteMany({ where: { companyId, id: { in: ids } } });
    for (const id of ids) {
      await this.logActivity(id, companyId, 'DELETED', actor, 'Bulk deleted').catch(() => {});
    }
    return { updated: result.count, failed: ids.length - result.count };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async logActivity(
    documentId: string, companyId: string, type: DocumentActivityType,
    actor: DocumentActor, title: string, meta?: Record<string, unknown>,
  ) {
    return prisma.documentActivity.create({
      data: {
        documentId,
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
