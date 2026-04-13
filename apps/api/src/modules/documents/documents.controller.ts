import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@wacrm/database';

function userActor(user: User) {
  return { type: 'user' as const, id: user.id };
}

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@RequirePermissions('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List documents with filters' })
  list(
    @CurrentUser() user: User,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('contactId') contactId?: string,
    @Query('dealId') dealId?: string,
    @Query('isTemplate') isTemplate?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list(user.companyId, {
      search,
      type,
      status: status ? (status.split(',') as never) : undefined,
      contactId,
      dealId,
      isTemplate: isTemplate !== undefined ? isTemplate === 'true' : undefined,
      sort: sort as never,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Document stats snapshot' })
  stats(@CurrentUser() user: User) {
    return this.svc.stats(user.companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document by ID' })
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get document activity timeline' })
  timeline(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.getTimeline(user.companyId, id);
  }

  @Get(':id/signatures')
  @ApiOperation({ summary: 'List all signatures for a document' })
  getSignatures(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.getSignatures(user.companyId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create document' })
  create(@CurrentUser() user: User, @Body() body: Record<string, unknown>) {
    return this.svc.create(user.companyId, body as never, userActor(user));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update document fields' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.svc.update(user.companyId, id, body as never, userActor(user));
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive document' })
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.archive(user.companyId, id, userActor(user));
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore archived document to DRAFT' })
  restore(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.restore(user.companyId, id, userActor(user));
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate document' })
  duplicate(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.duplicate(user.companyId, id, userActor(user));
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to document timeline' })
  addNote(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { note: string }) {
    return this.svc.addNote(user.companyId, id, body.note, userActor(user));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete document' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(user.companyId, id, userActor(user));
  }

  @Post(':id/signatures')
  @ApiOperation({ summary: 'Request a signature from someone' })
  requestSignature(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { signerName: string; signerEmail?: string },
  ) {
    return this.svc.requestSignature(user.companyId, id, body, userActor(user));
  }

  @Patch(':id/signatures/:signatureId')
  @ApiOperation({ summary: 'Update signature status (SIGNED, DECLINED, EXPIRED)' })
  updateSignature(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('signatureId') signatureId: string,
    @Body() body: { status: string },
  ) {
    return this.svc.updateSignature(user.companyId, id, signatureId, body, userActor(user));
  }

  @Post('bulk/archive')
  @ApiOperation({ summary: 'Bulk archive documents' })
  bulkArchive(@CurrentUser() user: User, @Body() body: { ids: string[] }) {
    return this.svc.bulkArchive(user.companyId, body.ids, userActor(user));
  }

  @Post('bulk/delete')
  @ApiOperation({ summary: 'Bulk delete documents' })
  bulkDelete(@CurrentUser() user: User, @Body() body: { ids: string[] }) {
    return this.svc.bulkDelete(user.companyId, body.ids, userActor(user));
  }
}
