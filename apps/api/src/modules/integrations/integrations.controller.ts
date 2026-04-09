import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@wacrm/database';

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly svc: IntegrationsService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.svc.list(user.companyId, {});
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: { type: string; config?: any; isActive?: boolean }) {
    return this.svc.create(user.companyId, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { config?: any; isActive?: boolean }) {
    return this.svc.update(user.companyId, id, body);
  }

  @Delete(':id')
  delete(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.delete(user.companyId, id);
  }

  @Get('calendar/events')
  listCalendarEvents(@CurrentUser() user: User, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.listCalendarEvents(user.companyId, { from, to });
  }

  @Post('calendar/events')
  createCalendarEvent(@CurrentUser() user: User, @Body() body: { title: string; description?: string; startAt: string; endAt: string; location?: string; contactId?: string; dealId?: string }) {
    return this.svc.createCalendarEvent(user.companyId, body);
  }

  @Delete('calendar/events/:eventId')
  deleteCalendarEvent(@CurrentUser() user: User, @Param('eventId') eventId: string) {
    return this.svc.deleteCalendarEvent(user.companyId, eventId);
  }
}
