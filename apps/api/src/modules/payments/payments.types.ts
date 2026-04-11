/**
 * Shared types for the Payments module — DTOs, filters, actor tagged
 * union. All money is in minor units (paise/cents). Payments use the
 * existing PaymentStatus (PENDING/PAID/FAILED/REFUNDED/EXPIRED) and
 * PaymentProvider enums from the Prisma schema.
 */
import type {
  PaymentActivityType,
  PaymentStatus,
  PaymentProvider,
} from '@wacrm/database';

export type PaymentActor =
  | { type: 'user'; userId: string }
  | { type: 'ai' }
  | { type: 'system' }
  | { type: 'worker' }
  | { type: 'webhook' };

export interface CreatePaymentLinkDto {
  contactId: string;
  dealId?: string;
  invoiceId?: string;
  amount: number;
  currency?: string;
  description: string;
  notes?: string;
  tags?: string[];
}

export interface RecordManualPaymentDto {
  contactId?: string;
  dealId?: string;
  invoiceId?: string;
  amount: number;
  currency?: string;
  description: string;
  /** cash | bank_transfer | cheque | upi | other */
  method?: string;
  paidAt?: string | Date;
  notes?: string;
  tags?: string[];
}

export interface UpdatePaymentDto {
  description?: string | null;
  notes?: string | null;
  tags?: string[];
  invoiceId?: string | null;
  dealId?: string | null;
}

export interface RefundPaymentDto {
  /** Optional — defaults to full refund. Minor units. */
  amount?: number;
  reason?: string;
}

export interface ListPaymentsFilters {
  status?: PaymentStatus | PaymentStatus[];
  provider?: PaymentProvider | PaymentProvider[];
  contactId?: string;
  dealId?: string;
  invoiceId?: string;
  tag?: string;
  search?: string;
  createdFrom?: string | Date;
  createdTo?: string | Date;
  sort?: 'recent' | 'amount' | 'paid_at';
  page?: number;
  limit?: number;
}

export interface AddPaymentActivityInput {
  type: PaymentActivityType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentStatsSnapshot {
  rangeDays: number;
  totalPayments: number;
  byStatus: Record<string, number>;
  byProvider: Record<string, number>;
  /** Sum of amount where status=PAID */
  totalReceived: number;
  /** Sum of amount where status=PENDING */
  totalPending: number;
  /** Sum of refundedAmount where status=REFUNDED */
  totalRefunded: number;
  /** Count of PAID / count of (PAID+FAILED+EXPIRED) — percentage 0..100 or null */
  successRate: number | null;
  averageAmount: number | null;
}

export interface BulkMutationResult {
  updated: number;
  failed: number;
  errors: Array<{ id: string; reason: string }>;
}
