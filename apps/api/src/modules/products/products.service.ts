import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@wacrm/database';

@Injectable()
export class ProductsService {
  async list(companyId: string, filters: { isActive?: boolean }) {
    const where: any = { companyId };
    if (filters.isActive !== undefined) where.isActive = filters.isActive;
    return prisma.product.findMany({ where, orderBy: { name: 'asc' } });
  }

  async get(companyId: string, id: string) {
    const record = await prisma.product.findFirst({ where: { id, companyId } });
    if (!record) throw new NotFoundException('Product not found');
    return record;
  }

  async create(companyId: string, data: { name: string; description?: string; price?: number; currency?: string; sku?: string; isActive?: boolean }) {
    return prisma.product.create({ data: { companyId, ...data } });
  }

  async update(companyId: string, id: string, data: { name?: string; description?: string; price?: number; currency?: string; sku?: string; isActive?: boolean }) {
    await this.get(companyId, id);
    return prisma.product.update({ where: { id }, data });
  }

  async delete(companyId: string, id: string) {
    await this.get(companyId, id);
    return prisma.product.delete({ where: { id } });
  }
}
