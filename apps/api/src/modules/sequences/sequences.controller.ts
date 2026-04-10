/**
 * Sequences Controller — 20+ endpoints for full sequence lifecycle management.
 *
 * Sequence Management: list, get, create, update, activate, pause, archive, duplicate, delete
 * Analytics: stats, performance, timeline
 * Steps: add, update, remove, reorder
 * Enrollments: enroll, unenroll, pause, resume, stop, timeline
 * Bulk: bulk enroll, bulk pause, bulk unenroll
 */
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SequencesService } from './sequences.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@wacrm/database';
import type {
  CreateSequenceDto,
  UpdateSequenceDto,
  CreateStepDto,
  UpdateStepDto,
  EnrollContactDto,
  ListSequencesFilters,
} from './sequences.types';

@ApiTags('sequences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@Controller('sequences')
export class SequencesController {
  constructor(private readonly svc: SequencesService) {}

  // ============================================
  // Sequence Management
  // ============================================

  @Get()
  @ApiOperation({ summary: 'List all sequences with filters' })
  list(
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('tags') tags?: string,
    @Query('sort') sort?: 'recent' | 'used' | 'name' | 'completion',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: ListSequencesFilters = {
      status: status as any,
      search,
      tags: tags?.split(','),
      sort,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    };
    return this.svc.list(user.companyId, filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get overall sequence statistics' })
  getStats(@CurrentUser() user: User) {
    return this.svc.getStats(user.companyId);
  }

  @Get('performance')
  @ApiOperation({ summary: 'Get performance metrics for a sequence' })
  @ApiQuery({ name: 'sequenceId', required: true })
  getPerformance(@CurrentUser() user: User, @Query('sequenceId') sequenceId: string) {
    return this.svc.getPerformance(user.companyId, sequenceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sequence with steps' })
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get sequence activity timeline' })
  @ApiQuery({ name: 'limit', required: false })
  getTimeline(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getTimeline(user.companyId, id, limit ? parseInt(limit, 10) : undefined);
  }

  @Get(':id/enrollments')
  @ApiOperation({ summary: 'List enrollments for a sequence' })
  @ApiQuery({ name: 'status', required: false })
  getEnrollments(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('status') status?: string,
  ) {
    return this.svc.getEnrollments(user.companyId, id, status as any);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new DRAFT sequence' })
  create(@CurrentUser() user: User, @Body() dto: CreateSequenceDto) {
    return this.svc.create(user.companyId, dto, { type: 'user', userId: user.id });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update sequence details' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateSequenceDto) {
    return this.svc.update(user.companyId, id, dto, { type: 'user', userId: user.id });
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate a DRAFT sequence' })
  activate(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.activate(user.companyId, id, { type: 'user', userId: user.id });
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause an ACTIVE sequence' })
  pause(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.pause(user.companyId, id, { type: 'user', userId: user.id });
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a sequence' })
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.archive(user.companyId, id, { type: 'user', userId: user.id });
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate a sequence as DRAFT' })
  duplicate(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body?: { newName?: string },
  ) {
    return this.svc.duplicate(user.companyId, id, { type: 'user', userId: user.id }, body?.newName);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a sequence (DRAFT or ARCHIVED only)' })
  delete(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.delete(user.companyId, id, { type: 'user', userId: user.id });
  }

  // ============================================
  // Step Management
  // ============================================

  @Post(':id/steps')
  @ApiOperation({ summary: 'Add a step to a sequence' })
  addStep(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: CreateStepDto) {
    return this.svc.addStep(user.companyId, id, dto, { type: 'user', userId: user.id });
  }

  @Patch('steps/:stepId')
  @ApiOperation({ summary: 'Update a step' })
  updateStep(@CurrentUser() user: User, @Param('stepId') stepId: string, @Body() dto: UpdateStepDto) {
    return this.svc.updateStep(user.companyId, stepId, dto, { type: 'user', userId: user.id });
  }

  @Delete('steps/:stepId')
  @ApiOperation({ summary: 'Remove a step from its sequence' })
  removeStep(@CurrentUser() user: User, @Param('stepId') stepId: string) {
    return this.svc.removeStep(user.companyId, stepId, { type: 'user', userId: user.id });
  }

  @Post(':id/steps/reorder')
  @ApiOperation({ summary: 'Reorder steps in a sequence' })
  reorderSteps(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { stepIds: string[] },
  ) {
    return this.svc.reorderSteps(user.companyId, id, body.stepIds, { type: 'user', userId: user.id });
  }

  // ============================================
  // Enrollment Management (under /sequences)
  // ============================================

  @Post(':id/enroll')
  @ApiOperation({ summary: 'Enroll a contact in a sequence' })
  enrollContact(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: EnrollContactDto) {
    return this.svc.enrollContact(user.companyId, id, dto, { type: 'user', userId: user.id });
  }

  @Post(':id/bulk-enroll')
  @ApiOperation({ summary: 'Bulk enroll multiple contacts' })
  bulkEnroll(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { contactIds: string[] },
  ) {
    return this.svc.bulkEnroll(user.companyId, id, body.contactIds, { type: 'user', userId: user.id });
  }
}

/**
 * Enrollments Controller — handles individual enrollment operations
 */
@ApiTags('enrollments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly svc: SequencesService) {}

  @Delete(':id')
  @ApiOperation({ summary: 'Unenroll a contact from sequence' })
  unenrollContact(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.unenrollContact(user.companyId, id, { type: 'user', userId: user.id });
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause an enrollment' })
  pauseEnrollment(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body?: { reason?: string },
  ) {
    return this.svc.pauseEnrollment(user.companyId, id, body?.reason, { type: 'user', userId: user.id });
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume a paused enrollment' })
  resumeEnrollment(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.resumeEnrollment(user.companyId, id, { type: 'user', userId: user.id });
  }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Stop an enrollment' })
  stopEnrollment(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body?: { reason?: string },
  ) {
    return this.svc.stopEnrollment(user.companyId, id, { type: 'user', userId: user.id }, body?.reason);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get enrollment activity timeline' })
  @ApiQuery({ name: 'limit', required: false })
  getEnrollmentTimeline(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getEnrollmentTimeline(user.companyId, id, limit ? parseInt(limit, 10) : undefined);
  }

  // ============================================
  // Bulk Enrollment Operations
  // ============================================

  @Post('bulk-pause')
  @ApiOperation({ summary: 'Bulk pause multiple enrollments' })
  bulkPauseEnrollments(
    @CurrentUser() user: User,
    @Body() body: { enrollmentIds: string[]; reason?: string },
  ) {
    return this.svc.bulkPauseEnrollments(user.companyId, body.enrollmentIds, { type: 'user', userId: user.id }, body.reason);
  }

  @Post('bulk-unenroll')
  @ApiOperation({ summary: 'Bulk unenroll multiple contacts' })
  bulkUnenroll(
    @CurrentUser() user: User,
    @Body() body: { enrollmentIds: string[] },
  ) {
    return this.svc.bulkUnenroll(user.companyId, body.enrollmentIds, { type: 'user', userId: user.id });
  }
}

