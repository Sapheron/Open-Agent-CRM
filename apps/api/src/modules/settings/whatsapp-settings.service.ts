import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { prisma } from '@wacrm/database';
import type { WaAccountStatus } from '@wacrm/database';
import Redis from 'ioredis';

const WA_COMMAND_CHANNEL = 'wa:command';

@Injectable()
export class WhatsAppSettingsService {
  private readonly logger = new Logger(WhatsAppSettingsService.name);
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis((process.env.REDIS_URL || '').trim());
  }

  async listAccounts(companyId: string) {
    return prisma.whatsAppAccount.findMany({
      where: { companyId },
      select: {
        id: true,
        phoneNumber: true,
        displayName: true,
        status: true,
        provider: true,
        warmupStage: true,
        dailyMessageLimit: true,
        messagesSentToday: true,
        lastConnectedAt: true,
        lastErrorAt: true,
        // Never return sessionDataEnc or accessTokenEnc
      },
    });
  }

  async createAccount(companyId: string, phoneNumber?: string) {
    const id = `wa_${Math.random().toString(36).substring(2, 11)}`;
    const account = await prisma.whatsAppAccount.create({
      data: {
        id,
        companyId,
        phoneNumber: phoneNumber || `PENDING-${id}`,
        status: 'QR_PENDING',
      },
    });

    // Tell WhatsApp service to start a Baileys session for this account
    await this.publishCommand('start', id);
    return account;
  }

  async reconnectAccount(companyId: string, accountId: string) {
    const account = await prisma.whatsAppAccount.findFirst({
      where: { id: accountId, companyId },
    });
    if (!account) throw new NotFoundException('Account not found');

    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: { status: 'QR_PENDING', qrCode: null },
    });

    // Tell WhatsApp service to restart this session
    await this.publishCommand('start', accountId);
    return { message: 'Reconnecting…' };
  }

  async updateStatus(accountId: string, status: WaAccountStatus, qrCode?: string) {
    return prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: {
        status,
        qrCode: qrCode ?? null,
        ...(status === 'CONNECTED' ? { lastConnectedAt: new Date(), warmupStartedAt: new Date(), consecutiveErrors: 0 } : {}),
      },
    });
  }

  async deleteAccount(companyId: string, accountId: string) {
    const account = await prisma.whatsAppAccount.findFirst({
      where: { id: accountId, companyId },
    });
    if (!account) throw new NotFoundException('Account not found');

    // Tell WhatsApp service to stop this session before deleting
    await this.publishCommand('stop', accountId);
    return prisma.whatsAppAccount.delete({ where: { id: accountId } });
  }

  private async publishCommand(command: 'start' | 'stop', accountId: string) {
    const payload = JSON.stringify({ command, accountId });
    await this.redis.publish(WA_COMMAND_CHANNEL, payload);
    this.logger.log(`Published ${command} command for account ${accountId}`);
  }
}
