import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@wacrm/database';

@Injectable()
export class CampaignsService {
  async list(companyId: string, filters: { status?: string }) {
    const where: any = { companyId };
    if (filters.status) where.status = filters.status;
    return prisma.campaign.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async get(companyId: string, id: string) {
    const record = await prisma.campaign.findFirst({ where: { id, companyId } });
    if (!record) throw new NotFoundException('Campaign not found');
    return record;
  }

  async create(companyId: string, data: { name: string; channel?: string; status?: string; segmentId?: string; budget?: number; startDate?: string; endDate?: string }) {
    const { startDate, endDate, ...rest } = data;
    return prisma.campaign.create({
      data: {
        companyId,
        ...rest,
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate ? { endDate: new Date(endDate) } : {}),
      },
    });
  }

  async update(companyId: string, id: string, data: { name?: string; channel?: string; status?: string; segmentId?: string; budget?: number; startDate?: string; endDate?: string; sentCount?: number; replyCount?: number; convertedCount?: number }) {
    await this.get(companyId, id);
    const { startDate, endDate, ...rest } = data;
    return prisma.campaign.update({
      where: { id },
      data: {
        ...rest,
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate ? { endDate: new Date(endDate) } : {}),
      },
    });
  }

  async delete(companyId: string, id: string) {
    await this.get(companyId, id);
    return prisma.campaign.delete({ where: { id } });
  }
}
