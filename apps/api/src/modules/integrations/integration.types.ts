import type { IntegrationType, IntegrationStatus, IntegrationActivityType } from '@wacrm/database';

export type { IntegrationType, IntegrationStatus, IntegrationActivityType };

export interface IntegrationActor {
  type: 'user' | 'ai' | 'system';
  id?: string;
}

export interface CreateIntegrationDto {
  type: IntegrationType;
  name?: string;
  config?: Record<string, unknown>;
  webhookUrl?: string;
  webhookSecret?: string;
}

export interface UpdateIntegrationDto {
  name?: string;
  config?: Record<string, unknown>;
  webhookUrl?: string;
  webhookSecret?: string;
  isActive?: boolean;
}

export interface IntegrationStatsSnapshot {
  total: number;
  connected: number;
  disconnected: number;
  error: number;
  syncing: number;
  webhookLogs24h: number;
}

export interface CreateCalendarEventDto {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  location?: string;
  contactId?: string;
  dealId?: string;
}

export interface UpdateCalendarEventDto {
  title?: string;
  description?: string;
  startAt?: string;
  endAt?: string;
  location?: string;
}

export interface BulkMutationResult {
  updated: number;
  failed: number;
}
