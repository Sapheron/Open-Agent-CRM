import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@wacrm/database';

@Injectable()
export class InvoicesService {
  async list(companyId: string, filters: { status?: string }) {
    const where: any = { companyId };
    if (filters.status) where.status = filters.status;
    return prisma.invoice.findMany({
      where,
      include: { lineItems: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, id: string) {
    const record = await prisma.invoice.findFirst({
      where: { id, companyId },
      include: { lineItems: true },
    });
    if (!record) throw new NotFoundException('Invoice not found');
    return record;
  }

  async create(companyId: string, data: { invoiceNumber: string; contactId?: string; dealId?: string; status?: string; subtotal?: number; tax?: number; total?: number; currency?: string; dueDate?: string; notes?: string; lineItems?: { name: string; quantity?: number; unitPrice?: number; total?: number }[] }) {
    const { lineItems, dueDate, ...rest } = data;
    return prisma.invoice.create({
      data: {
        companyId,
        ...rest,
        ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
        ...(lineItems ? { lineItems: { create: lineItems } } : {}),
      },
      include: { lineItems: true },
    });
  }

  async update(companyId: string, id: string, data: { status?: string; subtotal?: number; tax?: number; total?: number; dueDate?: string; paidAt?: string; notes?: string }) {
    await this.get(companyId, id);
    const { dueDate, paidAt, ...rest } = data;
    return prisma.invoice.update({
      where: { id },
      data: {
        ...rest,
        ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
        ...(paidAt ? { paidAt: new Date(paidAt) } : {}),
      },
      include: { lineItems: true },
    });
  }

  async delete(companyId: string, id: string) {
    await this.get(companyId, id);
    return prisma.invoice.delete({ where: { id } });
  }
}
