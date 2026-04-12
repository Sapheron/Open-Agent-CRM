/**
 * Quotes REST API — admin endpoints (JWT + company scope guarded).
 *
 * Public customer-facing endpoints live in `public-quote.controller.ts`.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { QuoteStatus, User } from '@wacrm/database';
import { QuotesService } from './quotes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type {
  CreateQuoteDto,
  LineItemInput,
  QuoteActor,
  RejectQuoteDto,
  UpdateQuoteDto,
} from './quotes.types';

function userActor(user: User): QuoteActor {
  return { type: 'user', userId: user.id };
}

@ApiTags('quotes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@RequirePermissions('quotes')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly svc: QuotesService) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('contactId') contactId?: string,
    @Query('dealId') dealId?: string,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: 'recent' | 'total' | 'number' | 'valid_until',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list(user.companyId, {
      status: status ? (status.split(',') as QuoteStatus[]) : undefined,
      contactId,
      dealId,
      tag,
      search,
      sort,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('stats')
  stats(@CurrentUser() user: User, @Query('days') days?: string) {
    return this.svc.stats(user.companyId, days ? Number(days) : 30);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Get(':id/timeline')
  timeline(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getTimeline(
      user.companyId,
      id,
      limit ? Number(limit) : undefined,
    );
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: CreateQuoteDto) {
    return this.svc.create(user.companyId, userActor(user), body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateQuoteDto,
  ) {
    return this.svc.update(user.companyId, id, userActor(user), body);
  }

  @Post(':id/line-items')
  addLineItem(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: LineItemInput,
  ) {
    return this.svc.addLineItem(user.companyId, id, userActor(user), body);
  }

  @Patch(':id/line-items/:lid')
  updateLineItem(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('lid') lid: string,
    @Body() body: Partial<LineItemInput>,
  ) {
    return this.svc.updateLineItem(user.companyId, id, userActor(user), lid, body);
  }

  @Delete(':id/line-items/:lid')
  removeLineItem(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('lid') lid: string,
  ) {
    return this.svc.removeLineItem(user.companyId, id, userActor(user), lid);
  }

  @Post(':id/send')
  send(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.send(user.companyId, id, userActor(user));
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.accept(user.companyId, id, userActor(user));
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: RejectQuoteDto = {},
  ) {
    return this.svc.reject(user.companyId, id, userActor(user), body.reason);
  }

  @Post(':id/revoke')
  revoke(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { reason?: string } = {},
  ) {
    return this.svc.revoke(user.companyId, id, userActor(user), body.reason);
  }

  @Post(':id/expire')
  expire(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.expire(user.companyId, id, userActor(user));
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.duplicate(user.companyId, id, userActor(user));
  }

  @Post(':id/notes')
  addNote(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { body: string },
  ) {
    return this.svc.addNote(user.companyId, id, userActor(user), body.body);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: User, @Param('id') id: string) {
    await this.svc.remove(user.companyId, id);
    return { ok: true };
  }

  @Post('bulk/send')
  bulkSend(@CurrentUser() user: User, @Body() body: { ids: string[] }) {
    return this.svc.bulkSend(user.companyId, body.ids ?? [], userActor(user));
  }

  @Post('bulk/revoke')
  bulkRevoke(
    @CurrentUser() user: User,
    @Body() body: { ids: string[]; reason?: string },
  ) {
    return this.svc.bulkRevoke(
      user.companyId,
      body.ids ?? [],
      userActor(user),
      body.reason,
    );
  }

  @Post('bulk/delete')
  bulkDelete(@CurrentUser() user: User, @Body() body: { ids: string[] }) {
    return this.svc.bulkDelete(user.companyId, body.ids ?? []);
  }
}
