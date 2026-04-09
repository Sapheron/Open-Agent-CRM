import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@wacrm/database';

@Injectable()
export class ChatConversationsService {
  async list(companyId: string, userId: string) {
    return prisma.chatConversation.findMany({
      where: { companyId, userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, updatedAt: true },
      take: 50,
    });
  }

  async get(companyId: string, userId: string, id: string) {
    const conv = await prisma.chatConversation.findFirst({
      where: { id, companyId, userId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    return conv;
  }

  async create(companyId: string, userId: string) {
    return prisma.chatConversation.create({
      data: { companyId, userId, title: 'New Chat' },
    });
  }

  async updateTitle(companyId: string, userId: string, id: string, title: string) {
    await this.get(companyId, userId, id);
    return prisma.chatConversation.update({
      where: { id },
      data: { title },
    });
  }

  async delete(companyId: string, userId: string, id: string) {
    await this.get(companyId, userId, id);
    return prisma.chatConversation.delete({ where: { id } });
  }

  async getMessages(conversationId: string) {
    return prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, role: true, content: true, toolCalls: true,
        provider: true, model: true, latencyMs: true, createdAt: true,
      },
    });
  }

  async addMessage(conversationId: string, data: {
    role: string; content: string; toolCalls?: unknown;
    provider?: string; model?: string; latencyMs?: number;
  }) {
    const msg = await prisma.chatMessage.create({
      data: {
        conversationId,
        role: data.role,
        content: data.content,
        toolCalls: data.toolCalls as any ?? undefined,
        provider: data.provider,
        model: data.model,
        latencyMs: data.latencyMs,
      },
    });

    // Auto-generate title from first user message
    const conv = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: { title: true },
    });
    if (conv?.title === 'New Chat' && data.role === 'user') {
      const autoTitle = data.content.slice(0, 50) + (data.content.length > 50 ? '...' : '');
      await prisma.chatConversation.update({
        where: { id: conversationId },
        data: { title: autoTitle },
      });
    }

    // Touch conversation updatedAt
    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return msg;
  }
}
