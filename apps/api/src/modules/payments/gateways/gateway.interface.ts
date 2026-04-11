export interface CreatePaymentLinkOptions {
  amount: number;       // in smallest unit (paise/cents)
  currency: string;
  description: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  idempotencyKey: string;
  callbackUrl?: string;
}

export interface PaymentLinkResult {
  externalId: string;
  linkUrl: string;
  expiresAt?: Date;
}

export interface WebhookVerifyResult {
  externalId: string;
  status: 'PAID' | 'FAILED' | 'REFUNDED';
  amount?: number;
  currency?: string;
  paidAt?: Date;
}

export interface RefundOptions {
  /** Gateway's payment id (externalId on our Payment row). */
  externalId: string;
  /** Optional — defaults to a full refund when omitted. Minor units. */
  amount?: number;
  /** Human-readable reason passed through to the gateway where supported. */
  reason?: string;
  /** Used to prevent double-refunds on retry. */
  idempotencyKey: string;
}

export interface RefundResult {
  /** Gateway's refund id. */
  refundId: string;
  /** Amount actually refunded in minor units. */
  amount: number;
  /** Most gateways return 'processed' / 'pending' — we treat either as success. */
  status: 'processed' | 'pending';
}

export interface PaymentGateway {
  readonly provider: string;

  /** Create a payment link and return the URL */
  createPaymentLink(opts: CreatePaymentLinkOptions): Promise<PaymentLinkResult>;

  /** Verify webhook signature and parse payload */
  verifyWebhook(payload: Buffer, signature: string, secret: string): WebhookVerifyResult;

  /** Test connection with current credentials */
  testConnection(): Promise<{ ok: boolean; error?: string }>;

  /**
   * Issue a refund through the gateway. Optional — providers that don't
   * expose a refund API (or that we haven't wired in Phase 1) leave this
   * undefined, and the service throws a helpful error when the user tries
   * to refund through the CRM.
   */
  refund?(opts: RefundOptions): Promise<RefundResult>;
}
