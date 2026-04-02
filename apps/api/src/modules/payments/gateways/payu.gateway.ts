import { createHash } from 'crypto';
import type { PaymentGateway, CreatePaymentLinkOptions, PaymentLinkResult, WebhookVerifyResult } from './gateway.interface';

export class PayUGateway implements PaymentGateway {
  readonly provider = 'payu';

  private readonly baseUrl: string;

  constructor(
    private readonly merchantKey: string,
    private readonly merchantSalt: string,
    testMode = false,
  ) {
    this.baseUrl = testMode
      ? 'https://test.payu.in'
      : 'https://secure.payu.in';
  }

  private hash(data: string): string {
    return createHash('sha512').update(data).digest('hex');
  }

  createPaymentLink(opts: CreatePaymentLinkOptions): Promise<PaymentLinkResult> {
    // PayU payment link API
    const txnId = opts.idempotencyKey.slice(0, 25);
    const amountInRupees = (opts.amount / 100).toFixed(2);

    const hashString = `${this.merchantKey}|${txnId}|${amountInRupees}|${opts.description}|${opts.contactName ?? 'Customer'}|${opts.contactEmail ?? 'noreply@wacrm.io'}|||||||||||${this.merchantSalt}`;
    const txnHash = this.hash(hashString);

    const params = new URLSearchParams({
      key: this.merchantKey,
      txnid: txnId,
      amount: amountInRupees,
      productinfo: opts.description,
      firstname: opts.contactName ?? 'Customer',
      email: opts.contactEmail ?? 'noreply@wacrm.io',
      phone: opts.contactPhone ?? '',
      surl: opts.callbackUrl ?? `${this.baseUrl}/success`,
      furl: opts.callbackUrl ?? `${this.baseUrl}/failure`,
      hash: txnHash,
      service_provider: 'payu_paisa',
    });

    // PayU doesn't have a "create payment link" API in the traditional sense —
    // it generates a payment page URL by posting form data. We return the action URL + params as the link.
    const linkUrl = `${this.baseUrl}/_payment?${params.toString()}`;

    return Promise.resolve({
      externalId: txnId,
      linkUrl,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  }

  verifyWebhook(payload: Buffer, _signature: string, salt: string): WebhookVerifyResult {
    // PayU posts form data to surl/furl
    const params = new URLSearchParams(payload.toString());
    const status = params.get('status') ?? 'failure';
    const txnId = params.get('txnid') ?? '';
    const amount = parseFloat(params.get('amount') ?? '0') * 100;

    // Verify reverse hash: sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
    const reverseHash = this.hash(
      `${salt}|${status}|${params.get('udf5') ?? ''}|${params.get('udf4') ?? ''}|${params.get('udf3') ?? ''}|${params.get('udf2') ?? ''}|${params.get('udf1') ?? ''}|${params.get('email') ?? ''}|${params.get('firstname') ?? ''}|${params.get('productinfo') ?? ''}|${params.get('amount') ?? ''}|${txnId}|${this.merchantKey}`,
    );

    if (reverseHash !== params.get('hash')) {
      throw new Error('Invalid PayU webhook signature');
    }

    return {
      externalId: txnId,
      status: status === 'success' ? 'PAID' : 'FAILED',
      amount,
      paidAt: status === 'success' ? new Date() : undefined,
    };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/merchant/postservice.php?form=2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ key: this.merchantKey, command: 'verify_payment', var1: 'test', hash: 'test' }),
      });
      // 200 = server reachable (credentials may still be wrong, but connection works)
      return { ok: res.status < 500 };
    } catch (e: unknown) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
