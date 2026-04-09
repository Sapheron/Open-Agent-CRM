import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@wacrm/database';

@Injectable()
export class AiMemoryService {
  async list(companyId: string, category?: string) {
    return prisma.aiMemory.findMany({
      where: { companyId, ...(category ? { category } : {}) },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(companyId: string, id: string) {
    const mem = await prisma.aiMemory.findFirst({ where: { id, companyId } });
    if (!mem) throw new NotFoundException('Memory not found');
    return mem;
  }

  async create(companyId: string, data: { title: string; content: string; category?: string }) {
    return prisma.aiMemory.create({
      data: {
        companyId,
        title: data.title,
        content: data.content,
        category: data.category || 'general',
      },
    });
  }

  async update(companyId: string, id: string, data: { title?: string; content?: string; category?: string; isActive?: boolean }) {
    await this.get(companyId, id);
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    return prisma.aiMemory.update({ where: { id }, data: updateData });
  }

  async delete(companyId: string, id: string) {
    await this.get(companyId, id);
    return prisma.aiMemory.delete({ where: { id } });
  }

  /** Get all active memories as a formatted string for injection into AI system prompt */
  async getMemoryContext(companyId: string): Promise<string> {
    const memories = await prisma.aiMemory.findMany({
      where: { companyId, isActive: true },
      orderBy: { category: 'asc' },
    });
    if (!memories.length) return '';

    const grouped = new Map<string, string[]>();
    for (const m of memories) {
      const cat = m.category || 'general';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(`- ${m.title}: ${m.content}`);
    }

    const sections: string[] = ['## Your Knowledge Base (Memory)'];
    for (const [cat, items] of grouped) {
      sections.push(`### ${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
      sections.push(items.join('\n'));
    }
    sections.push('Use this knowledge to provide accurate, context-aware responses.\n');
    return sections.join('\n');
  }
}
