import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WorkflowsService } from './workflows.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@wacrm/database';

function userActor(user: User) {
  return { type: 'user' as const, id: user.id };
}

@ApiTags('workflows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@RequirePermissions('workflows')
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly svc: WorkflowsService) {}

  @Get()
  @ApiOperation({ summary: 'List workflows with filters' })
  list(
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('tags') tags?: string,
    @Query('triggerType') triggerType?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list(user.companyId, {
      status: status ? (status.split(',') as never) : undefined,
      search,
      tags: tags ? tags.split(',') : undefined,
      triggerType,
      sort: sort as never,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Workflow stats snapshot' })
  stats(@CurrentUser() user: User) {
    return this.svc.stats(user.companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow by ID' })
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get workflow activity timeline' })
  timeline(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.getTimeline(user.companyId, id);
  }

  @Get(':id/executions')
  @ApiOperation({ summary: 'Get workflow execution history' })
  executions(@CurrentUser() user: User, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.svc.getExecutions(user.companyId, id, limit ? Number(limit) : 20);
  }

  @Post()
  @ApiOperation({ summary: 'Create workflow' })
  create(@CurrentUser() user: User, @Body() body: Record<string, unknown>) {
    return this.svc.create(user.companyId, body as never, userActor(user));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update workflow fields' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.svc.update(user.companyId, id, body as never, userActor(user));
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate workflow' })
  activate(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.activate(user.companyId, id, userActor(user));
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause workflow' })
  pause(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.pause(user.companyId, id, userActor(user));
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive workflow' })
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.archive(user.companyId, id, userActor(user));
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore archived workflow to DRAFT' })
  restore(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.restore(user.companyId, id, userActor(user));
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate workflow' })
  duplicate(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.duplicate(user.companyId, id, userActor(user));
  }

  @Post(':id/run')
  @ApiOperation({ summary: 'Manually trigger workflow execution' })
  run(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.run(user.companyId, id, userActor(user));
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to workflow timeline' })
  addNote(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { note: string }) {
    return this.svc.addNote(user.companyId, id, body.note, userActor(user));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete workflow' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(user.companyId, id, userActor(user));
  }

  @Post('bulk/activate')
  @ApiOperation({ summary: 'Bulk activate workflows' })
  bulkActivate(@CurrentUser() user: User, @Body() body: { ids: string[] }) {
    return this.svc.bulkActivate(user.companyId, body.ids, userActor(user));
  }

  @Post('bulk/pause')
  @ApiOperation({ summary: 'Bulk pause workflows' })
  bulkPause(@CurrentUser() user: User, @Body() body: { ids: string[] }) {
    return this.svc.bulkPause(user.companyId, body.ids, userActor(user));
  }

  @Post('bulk/archive')
  @ApiOperation({ summary: 'Bulk archive workflows' })
  bulkArchive(@CurrentUser() user: User, @Body() body: { ids: string[] }) {
    return this.svc.bulkArchive(user.companyId, body.ids, userActor(user));
  }

  @Post('bulk/delete')
  @ApiOperation({ summary: 'Bulk delete workflows' })
  bulkDelete(@CurrentUser() user: User, @Body() body: { ids: string[] }) {
    return this.svc.bulkDelete(user.companyId, body.ids, userActor(user));
  }
}
