/**
 * Shared types for the Quotes module — DTOs, filter shapes, and the
 * QuoteActor tagged union used by every mutation in `QuotesService`.
 */
import type {
  QuoteActivityType,
  QuoteStatus,
} from '@wacrm/database';

export type QuoteActor =
  | { type: 'user'; userId: string }
  | { type: 'ai' }
  | { type: 'system' }
  | { type: 'worker' }
  | { type: 'public' };

/**
 * A line item on a quote. Money is in minor units (paise/cents).
 * `discountBps` is 0–10000 (e.g. 1500 = 15.00%). `total` is computed by
 * `quotes.calc.ts`, never trusted from the client.
 */
export interface LineItemInput {
  productId?: string;
  name: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  discountBps?: number;
}

export interface CreateQuoteDto {
  contactId?: string;
  dealId?: string;
  title?: string;
  description?: string;
  /** Overrides the auto-generated Q-XXXX number. Usually omitted. */
  quoteNumber?: string;
  /** Total tax as bps (0–10000). */
  taxBps?: number;
  /** Quote-level flat discount in minor units. */
  discount?: number;
  currency?: string;
  validUntil?: string | Date;
  notes?: string;
  terms?: string;
  tags?: string[];
  autoMoveDealOnAccept?: boolean;
  lineItems?: LineItemInput[];
}

export interface UpdateQuoteDto {
  title?: string | null;
  description?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  taxBps?: number;
  discount?: number;
  currency?: string;
  validUntil?: string | Date | null;
  notes?: string | null;
  terms?: string | null;
  tags?: string[];
  autoMoveDealOnAccept?: boolean;
}

export interface ListQuotesFilters {
  status?: QuoteStatus | QuoteStatus[];
  contactId?: string;
  dealId?: string;
  tag?: string;
  search?: string;
  createdFrom?: string | Date;
  createdTo?: string | Date;
  sort?: 'recent' | 'total' | 'number' | 'valid_until';
  page?: number;
  limit?: number;
}

export interface AddQuoteActivityInput {
  type: QuoteActivityType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export interface QuoteStatsSnapshot {
  rangeDays: number;
  totalQuotes: number;
  byStatus: Record<string, number>;
  totalValue: number;       // sum of all quote totals
  acceptedValue: number;    // sum where status=ACCEPTED
  acceptanceRate: number | null; // percentage 0..100
  averageValue: number | null;   // mean of total
}

export interface PublicQuoteDefinition {
  id: string;
  quoteNumber: string;
  title: string | null;
  description: string | null;
  status: QuoteStatus;
  subtotal: number;
  tax: number;
  taxBps: number;
  discount: number;
  total: number;
  currency: string;
  validUntil: Date | null;
  terms: string | null;
  lineItems: Array<{
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    discountBps: number;
    total: number;
  }>;
  company: {
    name: string;
  };
}

export interface BulkMutationResult {
  updated: number;
  failed: number;
  errors: Array<{ id: string; reason: string }>;
}

export interface RejectQuoteDto {
  reason?: string;
}
