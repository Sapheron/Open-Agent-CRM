import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TasksService, CreateTaskDto } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User, TaskStatus } from '@wacrm/database';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly svc: TasksService) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('status') status?: TaskStatus,
    @Query('assignedAgentId') assignedAgentId?: string,
    @Query('contactId') contactId?: string,
    @Query('dealId') dealId?: string,
    @Query('overdue') overdue?: string,
    @Query('page') page?: number,
  ) {
    return this.svc.list(user.companyId, {
      status,
      assignedAgentId,
      contactId,
      dealId,
      overdue: overdue === 'true',
      page,
    });
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: CreateTaskDto) {
    return this.svc.create(user.companyId, user.id, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: Partial<CreateTaskDto>) {
    return this.svc.update(user.companyId, id, body);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark task as done' })
  complete(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.complete(user.companyId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(user.companyId, id);
  }
}
