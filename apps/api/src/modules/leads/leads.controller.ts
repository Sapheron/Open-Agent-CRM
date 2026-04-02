import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { LeadsService, CreateLeadDto } from './leads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User, LeadStatus } from '@wacrm/database';

class UpdateStatusBody {
  @IsEnum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATING', 'WON', 'LOST', 'DISQUALIFIED'])
  status: LeadStatus;
}

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly svc: LeadsService) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('status') status?: LeadStatus,
    @Query('contactId') contactId?: string,
    @Query('assignedAgentId') assignedAgentId?: string,
    @Query('page') page?: number,
  ) {
    return this.svc.list(user.companyId, { status, contactId, assignedAgentId, page });
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: CreateLeadDto) {
    return this.svc.create(user.companyId, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: Partial<CreateLeadDto>) {
    return this.svc.update(user.companyId, id, body);
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Update lead status (WON/LOST/etc.)' })
  updateStatus(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateStatusBody,
  ) {
    return this.svc.updateStatus(user.companyId, id, body.status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(user.companyId, id);
  }
}
