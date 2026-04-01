export const WS_EVENTS = {
  // Messages
  MESSAGE_NEW: 'message.new',
  MESSAGE_STATUS: 'message.status',

  // Conversations
  CONVERSATION_UPDATED: 'conversation.updated',
  CONVERSATION_ASSIGNED: 'conversation.assigned',

  // AI
  AI_TYPING: 'ai.typing',

  // WhatsApp account
  WA_QR: 'whatsapp.qr',
  WA_CONNECTED: 'whatsapp.connected',
  WA_DISCONNECTED: 'whatsapp.disconnected',
  WA_STATUS: 'whatsapp.status',

  // Notifications
  NOTIFICATION_NEW: 'notification.new',

  // Setup wizard
  SETUP_STEP_COMPLETE: 'setup.step_complete',
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
