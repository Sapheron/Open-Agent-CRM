import { Injectable } from '@nestjs/common';
import { prisma } from '@wacrm/database';
import type { MessageDirection, MessageType, MessageStatus } from '@wacrm/database';
import { WsGateway } from '../../gateway/ws.gateway';

export interface StoreMessageDto {
  companyId: string;
  conversationId: string;
  whatsappAccountId: string;
  direction: MessageDirection;
  type?: MessageType;
  body?: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaCaption?: string;
  whatsappMessageId?: string;
  idempotencyKey?: string;
  isAiGenerated?: boolean;
  aiProvider?: string;
  aiModel?: string;
  aiTokensUsed?: number;
  aiLatencyMs?: number;
  replyToMessageId?: string;
}

@Injectable()
export class MessagesService {
  constructor(private readonly ws: WsGateway) {}

  async store(dto: StoreMessageDto) {
    // Deduplication: if idempotencyKey already exists, return existing
    if (dto.idempotencyKey) {
      const existing = await prisma.message.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }

    const message = await prisma.message.create({
      data: {
        companyId: dto.companyId,
        conversationId: dto.conversationId,
        whatsappAccountId: dto.whatsappAccountId,
        direction: dto.direction,
        type: dto.type ?? 'TEXT',
        body: dto.body,
        mediaUrl: dto.mediaUrl,
        mediaType: dto.mediaType,
        mediaCaption: dto.mediaCaption,
        whatsappMessageId: dto.whatsappMessageId,
        idempotencyKey: dto.idempotencyKey,
        isAiGenerated: dto.isAiGenerated ?? false,
        aiProvider: dto.aiProvider,
        aiModel: dto.aiModel,
        aiTokensUsed: dto.aiTokensUsed,
        aiLatencyMs: dto.aiLatencyMs,
        replyToMessageId: dto.replyToMessageId,
        status: dto.direction === 'OUTBOUND' ? 'PENDING' : 'DELIVERED',
        sentAt: dto.direction === 'OUTBOUND' ? new Date() : null,
      },
    });

    // Update conversation's last message preview
    await prisma.conversation.update({
      where: { id: dto.conversationId },
      data: {
        lastMessageAt: message.createdAt,
        lastMessageText: dto.body?.slice(0, 100) ?? '[media]',
        ...(dto.direction === 'INBOUND' ? { unreadCount: { increment: 1 } } : {}),
      },
    });

    // Emit real-time event to dashboard
    this.ws.emitMessageNew(dto.companyId, {
      conversationId: dto.conversationId,
      message,
    });

    return message;
  }

  async updateStatus(whatsappMessageId: string, status: MessageStatus, timestamp?: Date) {
    const message = await prisma.message.findFirst({ where: { whatsappMessageId } });
    if (!message) return;

    await prisma.message.update({
      where: { id: message.id },
      data: {
        status,
        ...(status === 'DELIVERED' ? { deliveredAt: timestamp ?? new Date() } : {}),
        ...(status === 'READ' ? { readAt: timestamp ?? new Date() } : {}),
        ...(status === 'FAILED' ? { failedAt: timestamp ?? new Date() } : {}),
      },
    });

    this.ws.emitMessageStatus(message.companyId, {
      messageId: message.id,
      whatsappMessageId,
      status,
    });
  }
}
