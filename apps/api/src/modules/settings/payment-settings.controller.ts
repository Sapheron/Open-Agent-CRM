import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentSettingsService, UpsertPaymentConfigDto } from './payment-settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@wacrm/database';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@Controller('settings/payments')
export class PaymentSettingsController {
  constructor(private readonly svc: PaymentSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get payment gateway configuration' })
  get(@CurrentUser() user: User) {
    return this.svc.get(user.companyId);
  }

  @Put()
  @ApiOperation({ summary: 'Save payment gateway configuration from dashboard' })
  upsert(@CurrentUser() user: User, @Body() body: UpsertPaymentConfigDto) {
    return this.svc.upsert(user.companyId, body);
  }

  @Get('webhook-url')
  @ApiOperation({ summary: 'Get the webhook URL to paste into your gateway dashboard' })
  webhookUrl(@CurrentUser() user: User) {
    return this.svc.getWebhookUrl(user.companyId);
  }
}
