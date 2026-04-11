import { createHmac } from 'crypto';
import type {
  PaymentGateway,
  CreatePaymentLinkOptions,
  PaymentLinkResult,
  WebhookVerifyResult,
  RefundOptions,
  RefundResult,
} from './gateway.interface';

export class StripeGateway implements PaymentGateway {
  readonly provider = 'stripe';

  constructor(private readonly secretKey: string) {}

  private get authHeader(): string {
    return `Bearer ${this.secretKey}`;
  }

  private async stripePost(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
    const params = new URLSearchParams(body);
    const response = await fetch(`https://api.stripe.com/v1${path}`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json() as Record<string, unknown> & { error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message ?? 'Stripe API error');
    return data;
  }

  async createPaymentLink(opts: CreatePaymentLinkOptions): Promise<PaymentLinkResult> {
    // First create a price
    const price = await this.stripePost('/prices', {
      unit_amount: String(opts.amount),
      currency: opts.currency.toLowerCase(),
      'product_data[name]': opts.description,
    });

    const link = await this.stripePost('/payment_links', {
      'line_items[0][price]': price.id as string,
      'line_items[0][quantity]': '1',
      ...(opts.callbackUrl ? { after_completion: 'redirect', 'after_completion[redirect][url]': opts.callbackUrl } : {}),
      metadata: JSON.stringify({ idempotencyKey: opts.idempotencyKey }),
    });

    return {
      externalId: link.id as string,
      linkUrl: link.url as string,
    };
  }

  verifyWebhook(payload: Buffer, signature: string, secret: string): WebhookVerifyResult {
    // Stripe uses timestamp-signed payloads
    const parts = signature.split(',').reduce<Record<string, string>>((acc, part) => {
      const [k, v] = part.split('=');
      acc[k] = v;
      return acc;
    }, {});

    const signedPayload = `${parts['t']}.${payload.toString()}`;
    const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');
    if (expected !== parts['v1']) throw new Error('Invalid Stripe webhook signature');

    const event = JSON.parse(payload.toString()) as { type: string; data: { object: { id: string; amount_total?: number; currency?: string } } };
    const obj = event.data.object;

    const statusMap: Record<string, 'PAID' | 'FAILED'> = {
      'checkout.session.completed': 'PAID',
      'payment_intent.payment_failed': 'FAILED',
    };

    return {
      externalId: obj.id,
      status: statusMap[event.type] ?? 'FAILED',
      amount: obj.amount_total,
      currency: obj.currency,
      paidAt: event.type === 'checkout.session.completed' ? new Date() : undefined,
    };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: this.authHeader },
      });
      return { ok: res.ok };
    } catch (e: unknown) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async refund(opts: RefundOptions): Promise<RefundResult> {
    // externalId is the Checkout Session id. Stripe refunds operate on a
    // PaymentIntent, so we look up the session first to find it.
    const sessionRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${opts.externalId}`,
      { headers: { Authorization: this.authHeader } },
    );
    if (!sessionRes.ok) {
      throw new Error(`Stripe: could not resolve checkout session ${opts.externalId}`);
    }
    const session = (await sessionRes.json()) as { payment_intent?: string };
    if (!session.payment_intent) {
      throw new Error('Stripe: session has no payment_intent — cannot refund');
    }
    const body: Record<string, string> = {
      payment_intent: session.payment_intent,
    };
    if (opts.amount !== undefined) body.amount = String(opts.amount);
    if (opts.reason) body['metadata[reason]'] = opts.reason;
    const data = (await this.stripePost('/refunds', body)) as {
      id: string;
      amount: number;
      status: string;
    };
    return {
      refundId: data.id,
      amount: data.amount,
      status: data.status === 'succeeded' ? 'processed' : 'pending',
    };
  }
}
