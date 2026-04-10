import { Module } from '@nestjs/common';
import { LeadIntakeService } from './lead-intake.service';
import { LeadIntakeController } from './lead-intake.controller';
import { MetaLeadsWebhookController } from './meta-webhook.controller';
import { CustomLeadsWebhookController } from './custom-webhook.controller';
import { LeadsModule } from '../leads/leads.module';
import { ApiKeyAuthGuard } from '../../common/guards/api-key-auth.guard';

@Module({
  imports: [LeadsModule],
  controllers: [
    LeadIntakeController,
    MetaLeadsWebhookController,
    CustomLeadsWebhookController,
  ],
  providers: [LeadIntakeService, ApiKeyAuthGuard],
})
export class LeadIntakeModule {}
