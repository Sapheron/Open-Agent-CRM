import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@wacrm/database';

@Injectable()
export class QuotesService {
  async list(companyId: string, filters: { status?: string }) {
    const where: any = { companyId };
    if (filters.status) where.status = filters.status;
    return prisma.quote.findMany({
      where,
      include: { lineItems: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, id: string) {
    const record = await prisma.quote.findFirst({
      where: { id, companyId },
      include: { lineItems: true },
    });
    if (!record) throw new NotFoundException('Quote not found');
    return record;
  }

  async create(companyId: string, data: { quoteNumber: string; contactId?: string; dealId?: string; status?: string; subtotal?: number; tax?: number; discount?: number; total?: number; currency?: string; validUntil?: string; notes?: string; lineItems?: { productId?: string; name: string; quantity?: number; unitPrice?: number; total?: number }[] }) {
    const { lineItems, validUntil, ...rest } = data;
    return prisma.quote.create({
      data: {
        companyId,
        ...rest,
        ...(validUntil ? { validUntil: new Date(validUntil) } : {}),
        ...(lineItems ? { lineItems: { create: lineItems } } : {}),
      },
      include: { lineItems: true },
    });
  }

  async update(companyId: string, id: string, data: { status?: string; subtotal?: number; tax?: number; discount?: number; total?: number; validUntil?: string; notes?: string }) {
    await this.get(companyId, id);
    const { validUntil, ...rest } = data;
    return prisma.quote.update({
      where: { id },
      data: { ...rest, ...(validUntil ? { validUntil: new Date(validUntil) } : {}) },
      include: { lineItems: true },
    });
  }

  async delete(companyId: string, id: string) {
    await this.get(companyId, id);
    return prisma.quote.delete({ where: { id } });
  }
}
