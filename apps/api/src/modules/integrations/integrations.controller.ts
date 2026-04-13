import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@wacrm/database';

function userActor(user: User) {
  return { type: 'user' as const, id: user.id };
}

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@RequirePermissions('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly svc: IntegrationsService) {}

  @Get()
  @ApiOperation({ summary: 'List integrations' })
  list(
    @CurrentUser() user: User,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.list(user.companyId, { type, status });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Integration stats snapshot' })
  stats(@CurrentUser() user: User) {
    return this.svc.stats(user.companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get integration by ID' })
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get integration activity timeline' })
  timeline(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.getTimeline(user.companyId, id);
  }

  @Get(':id/webhook-logs')
  @ApiOperation({ summary: 'Get webhook logs for integration' })
  webhookLogs(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getWebhookLogs(user.companyId, id, limit ? Number(limit) : 20);
  }

  @Post()
  @ApiOperation({ summary: 'Create integration' })
  create(@CurrentUser() user: User, @Body() body: Record<string, unknown>) {
    return this.svc.create(user.companyId, body as never, userActor(user));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update integration config' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.svc.update(user.companyId, id, body as never, userActor(user));
  }

  @Post(':id/connect')
  @ApiOperation({ summary: 'Mark integration as connected' })
  connect(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.connect(user.companyId, id, userActor(user));
  }

  @Post(':id/disconnect')
  @ApiOperation({ summary: 'Disconnect integration' })
  disconnect(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.disconnect(user.companyId, id, userActor(user));
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test integration connection' })
  test(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.testConnection(user.companyId, id, userActor(user));
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Trigger a sync for the integration' })
  sync(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.sync(user.companyId, id, userActor(user));
  }

  @Post(':id/webhook')
  @ApiOperation({ summary: 'Trigger a webhook outbound call' })
  triggerWebhook(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.svc.triggerWebhook(user.companyId, id, payload, userActor(user));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete integration' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(user.companyId, id, userActor(user));
  }

  @Post('bulk/disconnect')
  @ApiOperation({ summary: 'Bulk disconnect integrations' })
  bulkDisconnect(@CurrentUser() user: User, @Body() body: { ids: string[] }) {
    return this.svc.bulkDisconnect(user.companyId, body.ids, userActor(user));
  }

  @Post('bulk/delete')
  @ApiOperation({ summary: 'Bulk delete integrations' })
  bulkDelete(@CurrentUser() user: User, @Body() body: { ids: string[] }) {
    return this.svc.bulkDelete(user.companyId, body.ids, userActor(user));
  }

  // ── Calendar ───────────────────────────────────────────────────────────────

  @Get('calendar/events')
  @ApiOperation({ summary: 'List calendar events' })
  listCalendarEvents(
    @CurrentUser() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.listCalendarEvents(user.companyId, { from, to });
  }

  @Post('calendar/events')
  @ApiOperation({ summary: 'Create calendar event' })
  createCalendarEvent(@CurrentUser() user: User, @Body() body: Record<string, unknown>) {
    return this.svc.createCalendarEvent(user.companyId, body as never);
  }

  @Patch('calendar/events/:eventId')
  @ApiOperation({ summary: 'Update calendar event' })
  updateCalendarEvent(
    @CurrentUser() user: User,
    @Param('eventId') eventId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.updateCalendarEvent(user.companyId, eventId, body as never);
  }

  @Delete('calendar/events/:eventId')
  @ApiOperation({ summary: 'Delete calendar event' })
  deleteCalendarEvent(@CurrentUser() user: User, @Param('eventId') eventId: string) {
    return this.svc.deleteCalendarEvent(user.companyId, eventId);
  }
}
