import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@wacrm/database';

@Injectable()
export class TemplatesService {
  async list(companyId: string, filters: { category?: string }) {
    const where: any = { companyId };
    if (filters.category) where.category = filters.category;
    return prisma.template.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async get(companyId: string, id: string) {
    const record = await prisma.template.findFirst({ where: { id, companyId } });
    if (!record) throw new NotFoundException('Template not found');
    return record;
  }

  async create(companyId: string, data: { name: string; category?: string; body: string; variables?: string[] }) {
    return prisma.template.create({ data: { companyId, ...data } });
  }

  async update(companyId: string, id: string, data: { name?: string; category?: string; body?: string; variables?: string[] }) {
    await this.get(companyId, id);
    return prisma.template.update({ where: { id }, data });
  }

  async delete(companyId: string, id: string) {
    await this.get(companyId, id);
    return prisma.template.delete({ where: { id } });
  }
}
