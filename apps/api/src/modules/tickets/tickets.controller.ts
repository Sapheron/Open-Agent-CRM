import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@wacrm/database';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly svc: TicketsService) {}

  @Get()
  list(@CurrentUser() user: User, @Query('status') status?: string, @Query('priority') priority?: string) {
    return this.svc.list(user.companyId, { status, priority });
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: { title: string; description?: string; contactId?: string; assignedToId?: string; status?: string; priority?: string; category?: string; source?: string }) {
    return this.svc.create(user.companyId, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { title?: string; description?: string; assignedToId?: string; status?: string; priority?: string; category?: string }) {
    return this.svc.update(user.companyId, id, body);
  }

  @Delete(':id')
  delete(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.delete(user.companyId, id);
  }

  @Get(':id/comments')
  listComments(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.listComments(user.companyId, id);
  }

  @Post(':id/comments')
  addComment(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { content: string; isInternal?: boolean }) {
    return this.svc.addComment(user.companyId, id, user.id, body);
  }
}
