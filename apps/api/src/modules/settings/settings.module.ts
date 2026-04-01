import { Module } from '@nestjs/common';
import { AiSettingsController } from './ai-settings.controller';
import { AiSettingsService } from './ai-settings.service';
import { PaymentSettingsController } from './payment-settings.controller';
import { PaymentSettingsService } from './payment-settings.service';
import { WhatsAppSettingsController } from './whatsapp-settings.controller';
import { WhatsAppSettingsService } from './whatsapp-settings.service';

@Module({
  controllers: [
    AiSettingsController,
    PaymentSettingsController,
    WhatsAppSettingsController,
  ],
  providers: [
    AiSettingsService,
    PaymentSettingsService,
    WhatsAppSettingsService,
  ],
  exports: [AiSettingsService, PaymentSettingsService],
})
export class SettingsModule {}
