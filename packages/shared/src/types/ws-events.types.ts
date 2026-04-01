import type {
  Message,
  MessageStatus,
  Conversation,
  WaAccountStatus,
} from '@prisma/client';

export interface WsMessageNew {
  conversationId: string;
  message: Message;
}

export interface WsMessageStatus {
  messageId: string;
  whatsappMessageId?: string;
  status: MessageStatus;
}

export interface WsConversationUpdated {
  conversationId: string;
  changes: Partial<Conversation>;
}

export interface WsConversationAssigned {
  conversationId: string;
  agentId: string | null;
}

export interface WsAiTyping {
  conversationId: string;
}

export interface WsWhatsAppQr {
  accountId: string;
  qrCode: string;
}

export interface WsWhatsAppConnected {
  accountId: string;
  phoneNumber: string;
  displayName?: string;
}

export interface WsWhatsAppDisconnected {
  accountId: string;
  reason: string;
}

export interface WsWhatsAppStatus {
  accountId: string;
  status: WaAccountStatus;
}

export interface WsNotificationNew {
  title: string;
  body: string;
  type: 'info' | 'success' | 'warning' | 'error';
  link?: string;
}

export interface WsSetupStepComplete {
  step: number;
  totalSteps: number;
}
