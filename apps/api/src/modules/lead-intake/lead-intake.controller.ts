/**
 * JWT-protected admin endpoints for managing lead-intake integrations.
 * Webhook receivers live in `meta-webhook.controller.ts` and
 * `custom-webhook.controller.ts` (no auth / API key auth).
 */
import {
  Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User, LeadIntegrationProvider, LeadIntegrationStatus, LeadPriority } from '@wacrm/database';
import { LeadIntakeService } from './lead-intake.service';
import { checkLeadIntakeEligibility, buildMetaWebhookUrl, buildCustomWebhookUrl } from './lead-intake.eligibility';

const PROVIDERS = ['META_ADS', 'CUSTOM_WEBHOOK'] as const;
const STATUSES = ['ACTIVE', 'PAUSED', 'ERROR'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

class CreateIntegrationBody {
  @IsEnum(PROVIDERS) provider: LeadIntegrationProvider;
  @IsString() name: string;
  @IsString() @IsOptional() metaPageId?: string;
  @IsString() @IsOptional() metaPageName?: string;
  @IsString() @IsOptional() metaAppSecret?: string;
  @IsString() @IsOptional() metaPageAccessToken?: string;
  @IsArray() @IsOptional() defaultTags?: string[];
  @IsEnum(PRIORITIES) @IsOptional() defaultPriority?: LeadPriority;
}

class UpdateIntegrationBody {
  @IsString() @IsOptional() name?: string;
  @IsEnum(STATUSES) @IsOptional() status?: LeadIntegrationStatus;
  @IsString() @IsOptional() metaPageId?: string;
  @IsString() @IsOptional() metaPageName?: string;
  @IsString() @IsOptional() metaAppSecret?: string;
  @IsString() @IsOptional() metaPageAccessToken?: string;
  @IsArray() @IsOptional() defaultTags?: string[];
  @IsEnum(PRIORITIES) @IsOptional() defaultPriority?: LeadPriority;
}

@ApiTags('lead-integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@Controller('lead-integrations')
export class LeadIntakeController {
  constructor(
    private readonly svc: LeadIntakeService,
  ) {}

  /**
   * Returns whether this CRM is hosted on a real domain that Meta can reach.
   * The dashboard calls this on mount to decide whether to gray out the
   * Meta connection panel.
   *
   * Auto-detects from request headers if API_PUBLIC_URL is not set.
   */
  @Get('eligibility')
  async eligibility(@Req() req: Request, @CurrentUser() user: User) {
    // Fetch company to get publicUrl setting
    const company = await this.svc.getCompany(user.companyId);

    // Check eligibility with fallback: Company.publicUrl → env → request headers
    const result = checkLeadIntakeEligibility(
      company.publicUrl,
      req.headers,
      req.secure,
    );

    return {
      ...result,
      customWebhookUrl: result.eligible ? buildCustomWebhookUrl(company.publicUrl) : null,
    };
  }

  @Get()
  async list(@CurrentUser() user: User) {
    const items = await this.svc.listIntegrations(user.companyId);
    const company = await this.svc.getCompany(user.companyId);

    // Annotate each with its public webhook URL when eligible
    return items.map((i) => ({
      ...i,
      webhookUrl: i.provider === 'META_ADS' ? buildMetaWebhookUrl(i.id, company.publicUrl) : null,
    }));
  }

  @Get(':id')
  async get(@CurrentUser() user: User, @Param('id') id: string) {
    const integration = await this.svc.getIntegration(user.companyId, id);
    const company = await this.svc.getCompany(user.companyId);

    return {
      ...integration,
      webhookUrl: integration.provider === 'META_ADS' ? buildMetaWebhookUrl(integration.id, company.publicUrl) : null,
    };
  }

  @Post()
  async create(@CurrentUser() user: User, @Body() body: CreateIntegrationBody) {
    const integration = await this.svc.createIntegration(user.companyId, body);
    const company = await this.svc.getCompany(user.companyId);

    return {
      ...integration,
      webhookUrl: integration.provider === 'META_ADS' ? buildMetaWebhookUrl(integration.id, company.publicUrl) : null,
    };
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: UpdateIntegrationBody) {
    return this.svc.updateIntegration(user.companyId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.deleteIntegration(user.companyId, id);
  }

  @Post(':id/rotate-token')
  rotate(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.rotateVerifyToken(user.companyId, id);
  }
}
