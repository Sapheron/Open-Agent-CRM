import { Injectable } from '@nestjs/common';
import { prisma } from '@wacrm/database';
import type { PaymentProvider } from '@wacrm/database';
import { encrypt } from '@wacrm/shared';

export interface UpsertPaymentConfigDto {
  provider: PaymentProvider;
  key?: string;
  secret?: string;
  webhookSecret?: string;
  currency?: string;
  testMode?: boolean;
}

@Injectable()
export class PaymentSettingsService {
  async get(companyId: string) {
    const config = await prisma.paymentConfig.findUnique({ where: { companyId } });
    if (!config) return null;
    return {
      ...config,
      keySet: !!config.keyEncrypted,
      secretSet: !!config.secretEncrypted,
      webhookSecretSet: !!config.webhookSecret,
      keyEncrypted: undefined,
      secretEncrypted: undefined,
      webhookSecret: undefined,
    };
  }

  async upsert(companyId: string, dto: UpsertPaymentConfigDto) {
    const data: Record<string, unknown> = {
      provider: dto.provider,
      currency: dto.currency ?? 'INR',
      testMode: dto.testMode ?? true,
    };

    if (dto.key?.trim()) data.keyEncrypted = encrypt(dto.key.trim());
    if (dto.secret?.trim()) data.secretEncrypted = encrypt(dto.secret.trim());
    if (dto.webhookSecret?.trim()) data.webhookSecret = encrypt(dto.webhookSecret.trim());

    return prisma.paymentConfig.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    });
  }

  async getWebhookUrl(_companyId: string): Promise<string> {
    const domain = process.env.DOMAIN ?? 'localhost:3001';
    return `https://${domain}/api/webhooks/payment`;
  }
}
