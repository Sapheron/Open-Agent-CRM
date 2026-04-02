import { createHash } from 'crypto';
import type { PaymentGateway, CreatePaymentLinkOptions, PaymentLinkResult, WebhookVerifyResult } from './gateway.interface';

export class PhonePeGateway implements PaymentGateway {
  readonly provider = 'phonepe';

  private readonly baseUrl: string;

  constructor(
    private readonly merchantId: string,
    private readonly saltKey: string,
    private readonly saltIndex = '1',
    testMode = false,
  ) {
    this.baseUrl = testMode
      ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
      : 'https://api.phonepe.com/apis/hermes';
  }

  private xVerifyHeader(payload: string, endpoint: string): string {
    const hash = createHash('sha256')
      .update(`${payload}${endpoint}${this.saltKey}`)
      .digest('hex');
    return `${hash}###${this.saltIndex}`;
  }

  async createPaymentLink(opts: CreatePaymentLinkOptions): Promise<PaymentLinkResult> {
    const endpoint = '/pg/v1/pay';
    const payload = {
      merchantId: this.merchantId,
      merchantTransactionId: opts.idempotencyKey,
      amount: opts.amount,
      redirectUrl: opts.callbackUrl ?? 'https://yourdomain.com/payment/status',
      redirectMode: 'POST',
      mobileNumber: opts.contactPhone?.replace(/\D/g, ''),
      paymentInstrument: { type: 'PAY_PAGE' },
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const xVerify = this.xVerifyHeader(base64Payload, endpoint);

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': xVerify,
      },
      body: JSON.stringify({ request: base64Payload }),
    });

    if (!response.ok) {
      const err = await response.json() as { message?: string };
      throw new Error(err.message ?? 'PhonePe API error');
    }

    const data = await response.json() as {
      data: { instrumentResponse: { redirectInfo: { url: string } }; merchantTransactionId: string };
    };

    return {
      externalId: data.data.merchantTransactionId,
      linkUrl: data.data.instrumentResponse.redirectInfo.url,
    };
  }

  verifyWebhook(payload: Buffer, _signature: string, _secret: string): WebhookVerifyResult {
    const body = JSON.parse(payload.toString()) as {
      response: string;
    };

    const decoded = JSON.parse(Buffer.from(body.response, 'base64').toString()) as {
      code: string;
      data: { merchantTransactionId: string; amount: number; state: string };
    };

    const isPaid = decoded.code === 'PAYMENT_SUCCESS';

    return {
      externalId: decoded.data.merchantTransactionId,
      status: isPaid ? 'PAID' : 'FAILED',
      amount: decoded.data.amount,
      paidAt: isPaid ? new Date() : undefined,
    };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const endpoint = `/pg/v1/status/${this.merchantId}/test-txn`;
      const xVerify = this.xVerifyHeader('', endpoint);
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: { 'X-VERIFY': xVerify, 'X-MERCHANT-ID': this.merchantId },
      });
      return { ok: res.status !== 500 };
    } catch (e: unknown) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
