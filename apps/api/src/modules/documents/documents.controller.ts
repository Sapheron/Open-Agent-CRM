import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@wacrm/database';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@RequirePermissions('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: User, @Query('type') type?: string) {
    return this.svc.list(user.companyId, { type });
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: { name: string; type: string; fileUrl: string; fileSize?: number; mimeType?: string; contactId?: string; dealId?: string }) {
    return this.svc.create(user.companyId, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { name?: string; type?: string; fileUrl?: string }) {
    return this.svc.update(user.companyId, id, body);
  }

  @Delete(':id')
  delete(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.delete(user.companyId, id);
  }

  @Post(':id/signatures')
  addSignature(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { signerName: string; signerEmail?: string }) {
    return this.svc.addSignature(user.companyId, id, body);
  }

  @Patch(':id/signatures/:signatureId')
  updateSignature(@CurrentUser() user: User, @Param('id') id: string, @Param('signatureId') signatureId: string, @Body() body: { status: string }) {
    return this.svc.updateSignature(user.companyId, id, signatureId, body);
  }
}
