import type { PaymentGateway } from './gateway.interface';
import { RazorpayGateway } from './razorpay.gateway';
import { StripeGateway } from './stripe.gateway';
import { CashfreeGateway } from './cashfree.gateway';
import { PhonePeGateway } from './phonepe.gateway';
import { PayUGateway } from './payu.gateway';

export interface GatewayCredentials {
  provider: string;
  key: string;
  secret?: string;
  testMode?: boolean;
}

export class GatewayFactory {
  static create(creds: GatewayCredentials): PaymentGateway {
    switch (creds.provider) {
      case 'RAZORPAY':
        if (!creds.secret) throw new Error('Razorpay requires key + secret');
        return new RazorpayGateway(creds.key, creds.secret);

      case 'STRIPE':
        return new StripeGateway(creds.key);

      case 'CASHFREE':
        if (!creds.secret) throw new Error('Cashfree requires appId + secret');
        return new CashfreeGateway(creds.key, creds.secret, creds.testMode);

      case 'PHONEPE':
        if (!creds.secret) throw new Error('PhonePe requires merchantId + saltKey');
        return new PhonePeGateway(creds.key, creds.secret, '1', creds.testMode);

      case 'PAYU':
        if (!creds.secret) throw new Error('PayU requires merchantKey + merchantSalt');
        return new PayUGateway(creds.key, creds.secret, creds.testMode);

      default:
        throw new Error(`Unsupported payment provider: ${creds.provider}`);
    }
  }
}
