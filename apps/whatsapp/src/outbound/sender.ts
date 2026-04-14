/**
 * Outbound message sender with warmup rate limiting.
 * Called by the worker after AI generates a reply.
 */
import pino from 'pino';
import { prisma } from '@wacrm/database';
import { getSocket } from '../session/session.manager';
import { phoneToJid } from '@wacrm/shared';
import { sleep } from '@wacrm/shared';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// Warmup stage daily limits (messages/day)
const WARMUP_LIMITS = [20, 50, 100, 200, 400, 1000];

// Retry config matching OpenClaw's sendWithRetry pattern
const MAX_SEND_RETRIES = 3;
const RETRY_BASE_MS = 500;
const RETRYABLE_ERRORS = /closed|reset|timed\s*out|disconnect|no active socket/i;

function isRetryableError(err: unknown): boolean {
  return RETRYABLE_ERRORS.test(String((err as Error)?.message ?? err));
}

export async function sendTextMessage(
  accountId: string,
  toPhone: string,
  text: string,
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
  const sock = getSocket(accountId);
  if (!sock) {
    return { success: false, error: 'No active session for account' };
  }

  // Warmup check
  const account = await prisma.whatsAppAccount.findUnique({
    where: { id: accountId },
    select: { warmupStage: true, messagesSentToday: true, dailyMessageLimit: true, lastResetAt: true },
  });

  if (!account) return { success: false, error: 'Account not found' };

  // Reset daily counter if needed
  const now = new Date();
  const shouldReset = !account.lastResetAt || now.getDate() !== account.lastResetAt.getDate();
  if (shouldReset) {
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: { messagesSentToday: 0, lastResetAt: now },
    });
    account.messagesSentToday = 0;
  }

  const limit = WARMUP_LIMITS[account.warmupStage] ?? account.dailyMessageLimit;
  if (account.messagesSentToday >= limit) {
    logger.warn({ accountId, sent: account.messagesSentToday, limit }, 'Daily message limit reached');
    return { success: false, error: 'Daily message limit reached for warmup stage' };
  }

  // Humanizing delay: 0.5–3 seconds
  const delayMs = 500 + Math.random() * 2500;
  await sleep(delayMs);

  const jid = phoneToJid(toPhone);

  // Retry loop matching OpenClaw's sendWithRetry (deliver-reply.ts:61-82)
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_SEND_RETRIES; attempt++) {
    try {
      const result = await sock.sendMessage(jid, { text });

      await prisma.whatsAppAccount.update({
        where: { id: accountId },
        data: { messagesSentToday: { increment: 1 } },
      });

      logger.info({ accountId, toPhone, waMessageId: result?.key.id }, 'Message sent');
      return { success: true, waMessageId: result?.key?.id ?? undefined };
    } catch (err: unknown) {
      lastErr = err;
      if (attempt < MAX_SEND_RETRIES && isRetryableError(err)) {
        const backoff = RETRY_BASE_MS * attempt;
        logger.warn({ accountId, toPhone, attempt, backoff }, 'Send failed (retryable) — retrying');
        await sleep(backoff);
        continue;
      }
      break;
    }
  }

  logger.error({ accountId, toPhone, err: lastErr }, 'Failed to send message after retries');
  return { success: false, error: (lastErr as Error).message };
}

export async function sendMediaMessage(
  accountId: string,
  toPhone: string,
  mediaUrl: string,
  mimeType: string,
  caption?: string,
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
  const sock = getSocket(accountId);
  if (!sock) return { success: false, error: 'No active session' };

  const jid = phoneToJid(toPhone);
  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');
  const isAudio = mimeType.startsWith('audio/');

  try {
    let result;
    if (isImage) {
      result = await sock.sendMessage(jid, { image: { url: mediaUrl }, caption });
    } else if (isVideo) {
      result = await sock.sendMessage(jid, { video: { url: mediaUrl }, caption });
    } else if (isAudio) {
      result = await sock.sendMessage(jid, { audio: { url: mediaUrl }, mimetype: mimeType, ptt: true });
    } else {
      result = await sock.sendMessage(jid, { document: { url: mediaUrl }, mimetype: mimeType, caption });
    }

    return { success: true, waMessageId: result?.key?.id ?? undefined };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}
