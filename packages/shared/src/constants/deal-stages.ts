import type { DealStage } from '@prisma/client';

export const DEAL_STAGE_ORDER: DealStage[] = [
  'LEAD_IN',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  LEAD_IN: 'Lead In',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal Sent',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};

export const DEAL_STAGE_COLORS: Record<DealStage, string> = {
  LEAD_IN: '#6366f1',
  QUALIFIED: '#3b82f6',
  PROPOSAL: '#f59e0b',
  NEGOTIATION: '#8b5cf6',
  WON: '#22c55e',
  LOST: '#ef4444',
};
