/**
 * Subscribes to the Redis `wa:outbound` channel published by:
 *  - worker/agent-loop.ts (AI replies)
 *  - api/messages.controller.ts (manual agent replies)
 *  - worker/broadcast.processor.ts (broadcasts)
 *
 * Calls sendTextMessage / sendMediaMessage and updates the message status.
 */
import Redis from 'ioredis';
import pino from 'pino';
import { prisma } from '@wacrm/database';
import { sendTextMessage, sendMediaMessage } from './sender';
import { uploadMedia, mimeToExtension } from '../media/media-storage';
import { getSocket } from '../session/session.manager';
import { phoneToJid } from '@wacrm/shared';
import { rememberOutboundMessage } from '../inbound/outbound-dedupe';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const redisUrl = (process.env.REDIS_URL || '').trim();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

interface OutboundPayload {
  accountId: string;
  contactId?: string;
  toPhone: string;
  messageId?: string;   // DB message ID (for status update)
  text?: string;
  mediaUrl?: string;
  mimeType?: string;
  caption?: string;
  // Inline base64 media — uploaded to MinIO server-side then sent. Used by the
  // AI chat tool when the user attaches a file in the dashboard chat panel.
  mediaBase64?: string;
  fileName?: string;
}

interface BroadcastPayload {
  companyId: string;
  contactId: string;
  toPhone: string;
  text: string;
  mediaUrl?: string;
}

export function startOutboundSubscriber(): void {
  const subscriber = new Redis(redisUrl);

  subscriber.subscribe('wa:outbound', 'wa:broadcast', 'wa:typing', (err) => {
    if (err) {
      logger.error({ err }, 'Failed to subscribe to outbound channels');
      return;
    }
    logger.info('Outbound subscriber started (wa:outbound, wa:broadcast, wa:typing)');
  });

  subscriber.on('message', (channel: string, raw: string) => {
    if (channel === 'wa:typing') {
      void handleTyping(raw);
    } else {
      void handleOutbound(channel, raw);
    }
  });
}

/**
 * Show/clear the WhatsApp "typing…" indicator on the recipient's screen.
 * Published by StaffWaBridgeService and agent-loop before/after AI replies.
 */
async function handleTyping(raw: string): Promise<void> {
  try {
    const payload = JSON.parse(raw) as { accountId: string; toPhone: string; action: 'composing' | 'paused' };
    const { accountId, toPhone, action } = payload;
    const sock = getSocket(accountId);
    if (!sock) return;

    const jid = phoneToJid(toPhone);
    await sock.sendPresenceUpdate(action, jid);
    logger.debug({ accountId, toPhone, action }, 'Presence update sent');
  } catch (err: unknown) {
    logger.warn({ err }, 'Failed to send presence update');
  }
}

async function handleOutbound(channel: string, raw: string): Promise<void> {
  try {
    const payload = JSON.parse(raw) as OutboundPayload | BroadcastPayload;

    const accountId = (payload as OutboundPayload).accountId;
    const toPhone = payload.toPhone;

    if (!accountId || !toPhone) {
      // For broadcasts without accountId, look up active account for the company
      if ((payload as BroadcastPayload).companyId) {
        const account = await prisma.whatsAppAccount.findFirst({
          where: { companyId: (payload as BroadcastPayload).companyId, status: 'CONNECTED' },
          select: { id: true },
        });
        if (!account) {
          logger.warn({ payload }, 'No connected WA account for broadcast, skipping');
          return;
        }
        await sendText(account.id, toPhone, (payload as BroadcastPayload).text);
      }
      return;
    }

    const p = payload as OutboundPayload;

    // If the AI chat tool sent inline base64, upload it to MinIO first so
    // Baileys can fetch a real URL. (Baileys can take a Buffer directly too,
    // but the existing sendMediaMessage helper expects a URL.)
    let mediaUrl = p.mediaUrl;
    let mimeType = p.mimeType;
    if (p.mediaBase64 && p.mimeType) {
      try {
        const buffer = Buffer.from(p.mediaBase64, 'base64');
        const ext = (p.fileName?.split('.').pop()?.toLowerCase()) || mimeToExtension(p.mimeType);
        mediaUrl = await uploadMedia(buffer, p.mimeType, ext);
        mimeType = p.mimeType;
        logger.info({ mediaUrl, size: buffer.length }, 'Uploaded inline AI-chat media to MinIO');
      } catch (err: unknown) {
        logger.error({ err }, 'Failed to upload inline media to MinIO');
        return;
      }
    }

    // Send via Baileys
    let result: { success: boolean; waMessageId?: string; error?: string };

    if (mediaUrl && mimeType) {
      result = await sendMediaMessage(accountId, toPhone, mediaUrl, mimeType, p.caption ?? p.text);
    } else if (p.text) {
      result = await sendTextMessage(accountId, toPhone, p.text);
    } else {
      logger.warn({ channel, payload }, 'Outbound payload has neither text nor media, skipping');
      return;
    }

    // Track sent message ID so we can skip Baileys echoes in inbound monitor
    if (result.success && result.waMessageId) {
      const jid = phoneToJid(toPhone);
      rememberOutboundMessage(accountId, jid, result.waMessageId);
    }

    // Update message status in DB
    if (p.messageId) {
      await prisma.message.update({
        where: { id: p.messageId },
        data: {
          status: result.success ? 'SENT' : 'FAILED',
          whatsappMessageId: result.waMessageId,
          sentAt: result.success ? new Date() : undefined,
          failedAt: result.success ? undefined : new Date(),
          errorMessage: result.error,
        },
      });
    }

    if (!result.success) {
      logger.error({ accountId, toPhone, error: result.error }, 'Failed to send outbound message');
    }
  } catch (err: unknown) {
    logger.error({ channel, err }, 'Error handling outbound message');
  }
}

async function sendText(accountId: string, toPhone: string, text: string): Promise<void> {
  const result = await sendTextMessage(accountId, toPhone, text);
  if (!result.success) {
    logger.error({ accountId, toPhone, error: result.error }, 'Broadcast send failed');
  }
}
