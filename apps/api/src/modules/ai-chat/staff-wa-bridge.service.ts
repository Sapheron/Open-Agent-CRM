/**
 * StaffWaBridgeService — bridges WhatsApp self-messages to AiChatService.
 *
 * When a staff member sends a message to themselves on WhatsApp (their
 * connected number), monitor.ts publishes to the `staff.ai.request` Redis
 * channel. This service subscribes, runs AiChatService with the user's full
 * permissions, saves the exchange to ChatConversation/ChatMessage, and sends
 * the AI reply back to WhatsApp via `wa:outbound`.
 *
 * Each user gets one persistent ChatConversation per WhatsApp account, so
 * chat history is maintained across sessions and is visible in the dashboard.
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { prisma } from '@wacrm/database';
import Redis from 'ioredis';
import { AiChatService } from './ai-chat.service';

const STAFF_AI_REQUEST_CHANNEL = 'staff.ai.request';
const WA_OUTBOUND_CHANNEL = 'wa:outbound';
const redisUrl = (process.env.REDIS_URL || '').trim();

@Injectable()
export class StaffWaBridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StaffWaBridgeService.name);
  private subscriber!: Redis;
  private publisher!: Redis;

  constructor(private readonly aiChat: AiChatService) {}

  onModuleInit() {
    this.subscriber = new Redis(redisUrl);
    this.publisher = new Redis(redisUrl);

    this.subscriber.subscribe(STAFF_AI_REQUEST_CHANNEL, (err) => {
      if (err) {
        this.logger.error('Failed to subscribe to staff.ai.request: ' + String(err));
        return;
      }
      this.logger.log('Staff WhatsApp AI bridge active');
    });

    this.subscriber.on('message', (_channel: string, raw: string) => {
      void this.handleRequest(raw);
    });
  }

  onModuleDestroy() {
    void this.subscriber?.quit();
    void this.publisher?.quit();
  }

  private async handleRequest(raw: string): Promise<void> {
    let payload: { companyId: string; userId: string; accountId: string; text: string };
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch {
      this.logger.warn('Invalid staff.ai.request payload: ' + raw.slice(0, 100));
      return;
    }

    const { companyId, userId, accountId, text } = payload;
    this.logger.log(`Staff AI chat: user=${userId} account=${accountId}`);

    try {
      // Load user permissions
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { permissions: true, role: true },
      });
      if (!user) {
        this.logger.warn(`Staff AI chat: user ${userId} not found`);
        return;
      }

      // Find or create the persistent ChatConversation for this user+account
      let conv = await prisma.chatConversation.findFirst({
        where: { companyId, userId, whatsappAccountId: accountId },
        orderBy: { updatedAt: 'desc' },
      });
      if (!conv) {
        conv = await prisma.chatConversation.create({
          data: {
            companyId,
            userId,
            whatsappAccountId: accountId,
            title: 'WhatsApp AI Chat',
          },
        });
        this.logger.log(`Created new WhatsApp ChatConversation ${conv.id} for user ${userId}`);
      }

      // Load recent history (last 30 messages = ~15 turns)
      const history = await prisma.chatMessage.findMany({
        where: { conversationId: conv.id },
        orderBy: { createdAt: 'asc' },
        take: 30,
        select: { role: true, content: true },
      });

      // Save user message to history before calling AI
      await prisma.chatMessage.create({
        data: { conversationId: conv.id, role: 'user', content: text },
      });
      // Touch the conversation updatedAt so it bubbles up in list
      await prisma.chatConversation.update({
        where: { id: conv.id },
        data: { updatedAt: new Date() },
      });

      // Build message array: history + new user message
      const userMessages = [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: text },
      ];

      // Run AI with the user's permissions (same as dashboard chat)
      const result = await this.aiChat.chat(
        companyId,
        userMessages,
        conv.id,
        user.permissions,
        user.role,
      );

      // Save AI response to history
      await prisma.chatMessage.create({
        data: {
          conversationId: conv.id,
          role: 'assistant',
          content: result.content,
          provider: result.provider,
          model: result.model,
          latencyMs: result.latencyMs,
        },
      });

      // Get account phone to reply back to the staff member's own WhatsApp
      const account = await prisma.whatsAppAccount.findUnique({
        where: { id: accountId },
        select: { phoneNumber: true },
      });
      if (!account) return;

      // Publish outbound reply — sends to the account's own number (self-chat)
      await this.publisher.publish(
        WA_OUTBOUND_CHANNEL,
        JSON.stringify({
          accountId,
          toPhone: account.phoneNumber,
          text: result.content,
        }),
      );

      this.logger.log(`Staff AI reply sent for user=${userId} (${result.latencyMs}ms via ${result.provider}/${result.model})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Staff AI chat error for user=${userId}: ${msg}`);

      // Send error back to WhatsApp so staff member knows something went wrong
      try {
        const account = await prisma.whatsAppAccount.findUnique({
          where: { id: accountId },
          select: { phoneNumber: true },
        });
        if (account) {
          await this.publisher.publish(
            WA_OUTBOUND_CHANNEL,
            JSON.stringify({
              accountId,
              toPhone: account.phoneNumber,
              text: `⚠️ AI error: ${msg.slice(0, 200)}`,
            }),
          );
        }
      } catch { /* ignore send errors */ }
    }
  }
}
