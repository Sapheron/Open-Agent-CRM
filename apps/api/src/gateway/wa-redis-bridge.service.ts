/**
 * WhatsApp Redis Bridge — subscribes to Redis pub/sub events from the
 * WhatsApp service (QR codes, connection status) and relays them to
 * connected dashboard clients via the WebSocket gateway.
 *
 * This is the critical glue between the separate WhatsApp process and
 * the API's Socket.io server.
 */
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { prisma } from '@wacrm/database';
import { WsGateway } from './ws.gateway';

@Injectable()
export class WaRedisBridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WaRedisBridgeService.name);
  private subscriber: Redis;

  constructor(private readonly ws: WsGateway) {}

  async onModuleInit() {
    const redisUrl = (process.env.REDIS_URL || '').trim();
    this.subscriber = new Redis(redisUrl);

    // Use pattern subscribe to catch all relevant channels:
    //   wa:qr:<accountId>
    //   wa:connected:<accountId>
    //   wa:disconnected:<accountId>
    //   company:<companyId>:events  (ai.typing, message.new from worker)
    await this.subscriber.psubscribe(
      'wa:qr:*',
      'wa:connected:*',
      'wa:disconnected:*',
      'company:*:events',
    );

    this.subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      void this.handleMessage(channel, message).catch((err) => {
        this.logger.error({ channel, err }, 'Error handling Redis WA event');
      });
    });

    this.logger.log('Subscribed to WhatsApp Redis events (wa:qr:*, wa:connected:*, wa:disconnected:*, company:*:events)');
  }

  async onModuleDestroy() {
    await this.subscriber?.quit();
  }

  private async handleMessage(channel: string, raw: string) {
    // company:<companyId>:events — worker publishes ai.typing and message.new here
    const companyEventsMatch = channel.match(/^company:([^:]+):events$/);
    if (companyEventsMatch) {
      const companyId = companyEventsMatch[1];
      try {
        const payload = JSON.parse(raw) as { event: string; data: Record<string, unknown> };
        if (payload.event === 'ai.typing') {
          this.ws.emitAiTyping(companyId, payload.data as { conversationId: string });
        } else if (payload.event === 'message.new') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.ws.emitMessageNew(companyId, payload.data as any);
        }
      } catch {
        this.logger.warn({ channel }, 'Failed to parse company event');
      }
      return;
    }

    const data = JSON.parse(raw);
    const accountId: string = data.accountId;

    if (!accountId) {
      this.logger.warn({ channel }, 'Received event without accountId');
      return;
    }

    // Look up the companyId for this account so we emit to the correct room
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { companyId: true },
    });

    if (!account) {
      this.logger.warn({ accountId }, 'Account not found for Redis event');
      return;
    }

    const companyId = account.companyId;

    if (channel.startsWith('wa:qr:')) {
      this.logger.debug({ accountId }, 'Relaying QR code to dashboard');
      this.ws.emitWhatsAppQr(companyId, {
        accountId,
        qrCode: data.qrCode,
      });
    } else if (channel.startsWith('wa:connected:')) {
      this.logger.log({ accountId, phone: data.phoneNumber }, 'WhatsApp connected — relaying');
      this.ws.emitWhatsAppConnected(companyId, {
        accountId,
        phoneNumber: data.phoneNumber,
        displayName: data.displayName,
      });
    } else if (channel.startsWith('wa:disconnected:')) {
      this.logger.log({ accountId, reason: data.reason }, 'WhatsApp disconnected — relaying');
      this.ws.emitWhatsAppDisconnected(companyId, {
        accountId,
        reason: data.reason,
      });
    }
  }
}
