/**
 * Normalize a raw WAMessage into our internal InternalMessage format.
 * Handles Baileys wrapper types: ephemeralMessage, viewOnceMessage, etc.
 */
import type { WAMessage } from '@whiskeysockets/baileys';
import { jidToPhone } from '@wacrm/shared';

export interface InternalMessage {
  whatsappMessageId: string;
  fromPhone: string;        // E.164 without +
  fromJid: string;
  displayName?: string;
  body?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  mediaData?: { mimetype: string; url?: string; caption?: string };
  location?: { latitude: number; longitude: number };
  isGroup: boolean;
  timestampMs: number;
}

/**
 * Unwrap Baileys container message types to get the real content.
 * Disappearing chats wrap in ephemeralMessage, view-once in viewOnceMessageV2, etc.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapContent(raw: Record<string, any>): Record<string, any> {
  let content = raw;
  if (content.ephemeralMessage?.message) content = content.ephemeralMessage.message;
  if (content.viewOnceMessageV2?.message) content = content.viewOnceMessageV2.message;
  if (content.viewOnceMessage?.message) content = content.viewOnceMessage.message;
  if (content.documentWithCaptionMessage?.message) content = content.documentWithCaptionMessage.message;
  if (content.editedMessage?.message) content = content.editedMessage.message;
  return content;
}

export function normalizeMessage(msg: WAMessage): InternalMessage | null {
  const key = msg.key;
  if (!key.id || key.fromMe) return null; // skip our own outbound messages

  const jid = key.remoteJid ?? '';
  const isGroup = jid.endsWith('@g.us');
  if (isGroup) return null; // skip group messages for now

  // Skip non-standard JIDs (newsletters, status broadcasts, LID-based contacts)
  if (!jid.endsWith('@s.whatsapp.net')) return null;

  const fromJid = key.participant ?? jid;
  const fromPhone = jidToPhone(fromJid);

  const rawContent = msg.message;
  if (!rawContent) return null;

  // Unwrap container types (ephemeral, view-once, edited, etc.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = unwrapContent(rawContent as Record<string, any>);

  let body: string | undefined;
  let mediaType: InternalMessage['mediaType'];
  let mediaData: InternalMessage['mediaData'];
  let location: InternalMessage['location'];

  if (content.conversation) {
    body = content.conversation;
  } else if (content.extendedTextMessage?.text) {
    body = content.extendedTextMessage.text;
  } else if (content.imageMessage) {
    mediaType = 'image';
    mediaData = {
      mimetype: content.imageMessage.mimetype ?? 'image/jpeg',
      caption: content.imageMessage.caption ?? undefined,
    };
    body = content.imageMessage.caption ?? undefined;
  } else if (content.videoMessage) {
    mediaType = 'video';
    mediaData = { mimetype: content.videoMessage.mimetype ?? 'video/mp4', caption: content.videoMessage.caption ?? undefined };
    body = content.videoMessage.caption ?? undefined;
  } else if (content.audioMessage) {
    mediaType = 'audio';
    mediaData = { mimetype: content.audioMessage.mimetype ?? 'audio/ogg' };
  } else if (content.documentMessage) {
    mediaType = 'document';
    mediaData = { mimetype: content.documentMessage.mimetype ?? 'application/octet-stream', caption: content.documentMessage.caption ?? undefined };
  } else if (content.stickerMessage) {
    mediaType = 'sticker';
    mediaData = { mimetype: content.stickerMessage.mimetype ?? 'image/webp' };
  } else if (content.locationMessage) {
    location = {
      latitude: content.locationMessage.degreesLatitude ?? 0,
      longitude: content.locationMessage.degreesLongitude ?? 0,
    };
  } else if (content.contactMessage || content.contactsArrayMessage) {
    body = '[Contact card shared]';
  } else if (content.liveLocationMessage) {
    location = {
      latitude: content.liveLocationMessage.degreesLatitude ?? 0,
      longitude: content.liveLocationMessage.degreesLongitude ?? 0,
    };
  } else if (content.buttonsResponseMessage) {
    body = content.buttonsResponseMessage.selectedDisplayText ?? content.buttonsResponseMessage.selectedButtonId;
  } else if (content.listResponseMessage) {
    body = content.listResponseMessage.title ?? content.listResponseMessage.singleSelectReply?.selectedRowId;
  } else if (content.templateButtonReplyMessage) {
    body = content.templateButtonReplyMessage.selectedDisplayText ?? content.templateButtonReplyMessage.selectedId;
  } else if (content.reactionMessage || content.protocolMessage || content.senderKeyDistributionMessage) {
    // Reactions, protocol messages (deletes/reads), key distribution — skip silently
    return null;
  }
  // If we reach here with no body/media/location, the message type is unrecognized.
  // Still process it so the user sees something arrived, with a fallback body.
  if (!body && !mediaType && !location) {
    body = '[Unsupported message type]';
  }

  const pushName = msg.pushName ?? undefined;
  const timestampMs = typeof msg.messageTimestamp === 'number'
    ? msg.messageTimestamp * 1000
    : Number(msg.messageTimestamp ?? Date.now());

  return {
    whatsappMessageId: key.id,
    fromPhone,
    fromJid,
    displayName: pushName,
    body,
    mediaType,
    mediaData,
    location,
    isGroup,
    timestampMs,
  };
}
