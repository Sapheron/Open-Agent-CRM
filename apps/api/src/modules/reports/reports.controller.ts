import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@wacrm/database';

function userActor(user: User) {
  return { type: 'user' as const, id: user.id };
}

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@RequirePermissions('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'List reports with filters' })
  list(
    @CurrentUser() user: User,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('entity') entity?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list(user.companyId, {
      search,
      status: status ? (status.split(',') as never) : undefined,
      type: type as never,
      entity,
      sort: sort as never,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Report stats snapshot' })
  stats(@CurrentUser() user: User) {
    return this.svc.stats(user.companyId);
  }

  @Get('scheduled/all')
  @ApiOperation({ summary: 'List all scheduled reports' })
  listScheduled(@CurrentUser() user: User) {
    return this.svc.listScheduled(user.companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get report by ID' })
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get report activity timeline' })
  timeline(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.getTimeline(user.companyId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create report' })
  create(@CurrentUser() user: User, @Body() body: Record<string, unknown>) {
    return this.svc.create(user.companyId, body as never, userActor(user));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update report fields' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.svc.update(user.companyId, id, body as never, userActor(user));
  }

  @Post(':id/run')
  @ApiOperation({ summary: 'Execute a report and return results' })
  run(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.run(user.companyId, id, userActor(user));
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive report' })
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.archive(user.companyId, id, userActor(user));
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore archived report to DRAFT' })
  restore(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.restore(user.companyId, id, userActor(user));
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate report' })
  duplicate(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.duplicate(user.companyId, id, userActor(user));
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to report timeline' })
  addNote(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { note: string }) {
    return this.svc.addNote(user.companyId, id, body.note, userActor(user));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete report' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(user.companyId, id, userActor(user));
  }

  @Post(':id/schedule')
  @ApiOperation({ summary: 'Schedule a report to be sent on a recurring basis' })
  schedule(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { frequency?: string; recipients: string[]; isActive?: boolean },
  ) {
    return this.svc.schedule(user.companyId, id, body, userActor(user));
  }

  @Delete('schedules/:scheduleId')
  @ApiOperation({ summary: 'Delete a scheduled report' })
  unschedule(@CurrentUser() user: User, @Param('scheduleId') scheduleId: string) {
    return this.svc.unschedule(user.companyId, scheduleId, userActor(user));
  }

  @Post('bulk/archive')
  @ApiOperation({ summary: 'Bulk archive reports' })
  bulkArchive(@CurrentUser() user: User, @Body() body: { ids: string[] }) {
    return this.svc.bulkArchive(user.companyId, body.ids, userActor(user));
  }

  @Post('bulk/delete')
  @ApiOperation({ summary: 'Bulk delete reports' })
  bulkDelete(@CurrentUser() user: User, @Body() body: { ids: string[] }) {
    return this.svc.bulkDelete(user.companyId, body.ids, userActor(user));
  }
}
