import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@wacrm/database';

@Injectable()
export class TicketsService {
  async list(companyId: string, filters: { status?: string; priority?: string }) {
    const where: any = { companyId };
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    return prisma.ticket.findMany({
      where,
      include: { comments: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, id: string) {
    const record = await prisma.ticket.findFirst({
      where: { id, companyId },
      include: { comments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!record) throw new NotFoundException('Ticket not found');
    return record;
  }

  async create(companyId: string, data: { title: string; description?: string; contactId?: string; assignedToId?: string; status?: string; priority?: string; category?: string; source?: string }) {
    return prisma.ticket.create({
      data: { companyId, ...data },
      include: { comments: true },
    });
  }

  async update(companyId: string, id: string, data: { title?: string; description?: string; assignedToId?: string; status?: string; priority?: string; category?: string }) {
    await this.get(companyId, id);
    return prisma.ticket.update({
      where: { id },
      data,
      include: { comments: true },
    });
  }

  async delete(companyId: string, id: string) {
    await this.get(companyId, id);
    return prisma.ticket.delete({ where: { id } });
  }

  async listComments(companyId: string, ticketId: string) {
    await this.get(companyId, ticketId);
    return prisma.ticketComment.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addComment(companyId: string, ticketId: string, authorId: string, data: { content: string; isInternal?: boolean }) {
    await this.get(companyId, ticketId);
    return prisma.ticketComment.create({
      data: { ticketId, authorId, ...data },
    });
  }
}
