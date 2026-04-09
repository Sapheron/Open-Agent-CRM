import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { prisma } from '@wacrm/database';

@Injectable()
export class TagsService {
  async list(companyId: string) {
    return prisma.tag.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async create(companyId: string, data: { name: string; color?: string; description?: string }) {
    const existing = await prisma.tag.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
    });
    if (existing) throw new ConflictException(`Tag "${data.name}" already exists`);

    return prisma.tag.create({
      data: {
        companyId,
        name: data.name.trim(),
        color: data.color || '#8b5cf6',
        description: data.description || undefined,
      },
    });
  }

  async update(companyId: string, id: string, data: { name?: string; color?: string; description?: string }) {
    const tag = await prisma.tag.findFirst({ where: { id, companyId } });
    if (!tag) throw new NotFoundException('Tag not found');

    // If renaming, check uniqueness
    if (data.name && data.name !== tag.name) {
      const existing = await prisma.tag.findUnique({
        where: { companyId_name: { companyId, name: data.name } },
      });
      if (existing) throw new ConflictException(`Tag "${data.name}" already exists`);
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.color !== undefined) updateData.color = data.color;
    if (data.description !== undefined) updateData.description = data.description;

    // If name changed, update all contacts that have this tag
    if (data.name && data.name !== tag.name) {
      const contacts = await prisma.contact.findMany({
        where: { companyId, tags: { has: tag.name } },
        select: { id: true, tags: true },
      });
      for (const contact of contacts) {
        const newTags = contact.tags.map((t) => (t === tag.name ? data.name!.trim() : t));
        await prisma.contact.update({ where: { id: contact.id }, data: { tags: newTags } });
      }
    }

    return prisma.tag.update({ where: { id }, data: updateData });
  }

  async delete(companyId: string, id: string) {
    const tag = await prisma.tag.findFirst({ where: { id, companyId } });
    if (!tag) throw new NotFoundException('Tag not found');

    // Remove this tag from all contacts
    const contacts = await prisma.contact.findMany({
      where: { companyId, tags: { has: tag.name } },
      select: { id: true, tags: true },
    });
    for (const contact of contacts) {
      const newTags = contact.tags.filter((t) => t !== tag.name);
      await prisma.contact.update({ where: { id: contact.id }, data: { tags: newTags } });
    }

    return prisma.tag.delete({ where: { id } });
  }
}
