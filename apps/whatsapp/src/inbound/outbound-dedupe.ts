/**
 * Tracks recently sent outbound WhatsApp message IDs to prevent
 * Baileys echo events from being re-processed as inbound staff chat.
 *
 * Mirrors OpenClaw's dedupe.ts approach: after every sock.sendMessage(),
 * the caller records the returned message ID here. When messages.upsert
 * fires with fromMe=true, we check this store and skip any message we
 * sent ourselves.
 */

const TTL_MS = 20 * 60_000; // 20 minutes
const MAX_SIZE = 5000;

/** key → expiry timestamp */
const cache = new Map<string, number>();

function buildKey(accountId: string, remoteJid: string, messageId: string): string | null {
  if (!accountId || !remoteJid || !messageId || messageId === 'unknown') return null;
  return `${accountId.trim()}:${remoteJid.trim()}:${messageId.trim()}`;
}

function evict(): void {
  if (cache.size <= MAX_SIZE) return;
  const now = Date.now();
  for (const [k, exp] of cache) {
    if (exp < now) cache.delete(k);
    if (cache.size <= Math.floor(MAX_SIZE * 0.8)) break;
  }
}

export function rememberOutboundMessage(
  accountId: string,
  remoteJid: string,
  messageId: string,
): void {
  const key = buildKey(accountId, remoteJid, messageId);
  if (!key) return;
  cache.set(key, Date.now() + TTL_MS);
  evict();
}

export function isRecentOutboundMessage(
  accountId: string,
  remoteJid: string,
  messageId: string,
): boolean {
  const key = buildKey(accountId, remoteJid, messageId);
  if (!key) return false;
  const exp = cache.get(key);
  if (!exp) return false;
  if (Date.now() > exp) {
    cache.delete(key);
    return false;
  }
  return true;
}
