/**
 * Payments REST API — JWT + company scope guarded.
 *
 * Webhook receiver lives in `payments.webhook.ts` (public, signature-verified).
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type {
  PaymentProvider,
  PaymentStatus,
  User,
} from '@wacrm/database';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type {
  CreatePaymentLinkDto,
  PaymentActor,
  RecordManualPaymentDto,
  RefundPaymentDto,
  UpdatePaymentDto,
} from './payments.types';

function userActor(user: User): PaymentActor {
  return { type: 'user', userId: user.id };
}

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@RequirePermissions('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly svc: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('provider') provider?: string,
    @Query('contactId') contactId?: string,
    @Query('dealId') dealId?: string,
    @Query('invoiceId') invoiceId?: string,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: 'recent' | 'amount' | 'paid_at',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list(user.companyId, {
      status: status ? (status.split(',') as PaymentStatus[]) : undefined,
      provider: provider ? (provider.split(',') as PaymentProvider[]) : undefined,
      contactId,
      dealId,
      invoiceId,
      tag,
      search,
      sort,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('stats')
  stats(@CurrentUser() user: User, @Query('days') days?: string) {
    return this.svc.stats(user.companyId, days ? Number(days) : 30);
  }

  @Get('webhook-url')
  @ApiOperation({ summary: 'Get the webhook URL to configure in the payment gateway dashboard' })
  webhookUrl(@CurrentUser() user: User) {
    const domain = this.config.get<string>('DOMAIN') ?? 'localhost:3000';
    return { url: this.svc.getWebhookUrl(user.companyId, domain) };
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Get(':id/timeline')
  timeline(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getTimeline(
      user.companyId,
      id,
      limit ? Number(limit) : undefined,
    );
  }

  @Post('link')
  @ApiOperation({ summary: 'Create a gateway payment link' })
  createLink(@CurrentUser() user: User, @Body() body: CreatePaymentLinkDto) {
    if (!body.contactId) throw new BadRequestException('contactId required');
    return this.svc.createLink(user.companyId, userActor(user), body);
  }

  @Post('manual')
  @ApiOperation({ summary: 'Record a payment that happened outside the gateway' })
  recordManual(@CurrentUser() user: User, @Body() body: RecordManualPaymentDto) {
    return this.svc.recordManualPayment(user.companyId, userActor(user), body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdatePaymentDto,
  ) {
    return this.svc.update(user.companyId, id, userActor(user), body);
  }

  @Post(':id/refund')
  refund(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: RefundPaymentDto = {},
  ) {
    return this.svc.refund(user.companyId, id, userActor(user), body);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { reason?: string } = {},
  ) {
    return this.svc.cancel(user.companyId, id, userActor(user), body.reason);
  }

  @Post(':id/notes')
  addNote(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { body: string },
  ) {
    return this.svc.addNote(user.companyId, id, userActor(user), body.body);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: User, @Param('id') id: string) {
    await this.svc.remove(user.companyId, id);
    return { ok: true };
  }

  @Post('bulk/cancel')
  bulkCancel(
    @CurrentUser() user: User,
    @Body() body: { ids: string[]; reason?: string },
  ) {
    return this.svc.bulkCancel(
      user.companyId,
      body.ids ?? [],
      userActor(user),
      body.reason,
    );
  }

  @Post('bulk/delete')
  bulkDelete(@CurrentUser() user: User, @Body() body: { ids: string[] }) {
    return this.svc.bulkDelete(user.companyId, body.ids ?? []);
  }
}
