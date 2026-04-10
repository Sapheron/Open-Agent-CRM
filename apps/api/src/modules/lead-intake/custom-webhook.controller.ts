/**
 * Custom lead webhook — API-key-protected `POST /webhooks/leads/custom`.
 *
 * For users wiring up Tally / Typeform / Webflow / curl / a custom integration.
 * Body shape mirrors `CreateLeadDto` from the leads module so the same fields
 * a dashboard form would send work here as well.
 *
 * Auth: `Authorization: Bearer wacrm_<key>` validated by `ApiKeyAuthGuard`.
 * The key MUST carry the `leads:write` scope.
 */
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyAuthGuard } from '../../common/guards/api-key-auth.guard';
import { RequireScope } from '../../common/decorators/require-scope.decorator';
import { LeadIntakeService } from './lead-intake.service';
import type { CreateLeadDto } from '../leads/leads.types';

interface ApiKeyRequest extends Request {
  apiKey?: { id: string; companyId: string; scopes: string[] };
  companyId?: string;
}

@Controller('webhooks/leads/custom')
@UseGuards(ApiKeyAuthGuard)
export class CustomLeadsWebhookController {
  constructor(private readonly intake: LeadIntakeService) {}

  @Post()
  @RequireScope('leads:write')
  async create(@Req() req: ApiKeyRequest, @Body() body: CreateLeadDto) {
    return this.intake.ingestCustomLead(req.companyId!, body);
  }
}
