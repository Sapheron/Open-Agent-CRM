import {
  Controller, Get, Post, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User, ConversationStatus } from '@wacrm/database';

class AssignBody { @IsString() @IsOptional() agentId: string | null; }
class ToggleAiBody { @IsBoolean() enabled: boolean; }

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@RequirePermissions('whatsapp')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly svc: ConversationsService) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('status') status?: ConversationStatus,
    @Query('search') search?: string,
    @Query('page') page?: number,
  ) {
    return this.svc.list(user.companyId, { status, search, page });
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get paginated messages for a conversation' })
  getMessages(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.svc.getMessages(user.companyId, id, cursor);
  }

  @Post(':id/assign')
  assign(@CurrentUser() user: User, @Param('id') id: string, @Body() body: AssignBody) {
    return this.svc.assign(user.companyId, id, body.agentId);
  }

  @Post(':id/resolve')
  resolve(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.resolve(user.companyId, id);
  }

  @Post(':id/toggle-ai')
  @ApiOperation({ summary: 'Enable or disable AI for this specific conversation' })
  toggleAi(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: ToggleAiBody,
  ) {
    return this.svc.toggleAi(user.companyId, id, body.enabled);
  }
}
