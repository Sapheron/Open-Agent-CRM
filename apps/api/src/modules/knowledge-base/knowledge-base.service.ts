import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@wacrm/database';

@Injectable()
export class KnowledgeBaseService {
  async list(companyId: string, filters: { category?: string }) {
    const where: any = { companyId };
    if (filters.category) where.category = filters.category;
    return prisma.knowledgeBaseArticle.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async get(companyId: string, id: string) {
    const record = await prisma.knowledgeBaseArticle.findFirst({ where: { id, companyId } });
    if (!record) throw new NotFoundException('Article not found');
    return record;
  }

  async create(companyId: string, data: { title: string; content: string; category?: string; isPublic?: boolean }) {
    return prisma.knowledgeBaseArticle.create({ data: { companyId, ...data } });
  }

  async update(companyId: string, id: string, data: { title?: string; content?: string; category?: string; isPublic?: boolean }) {
    await this.get(companyId, id);
    return prisma.knowledgeBaseArticle.update({ where: { id }, data });
  }

  async delete(companyId: string, id: string) {
    await this.get(companyId, id);
    return prisma.knowledgeBaseArticle.delete({ where: { id } });
  }
}
