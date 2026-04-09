import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ChatConversationsService } from './chat-conversations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@wacrm/database';

@ApiTags('chat-conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@Controller('chat/conversations')
export class ChatConversationsController {
  constructor(private readonly svc: ChatConversationsService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.svc.list(user.companyId, user.id);
  }

  @Post()
  create(@CurrentUser() user: User) {
    return this.svc.create(user.companyId, user.id);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: User, @Param('id') id: string) {
    void this.svc.get(user.companyId, user.id, id); // verify access
    return this.svc.getMessages(id);
  }

  @Patch(':id')
  updateTitle(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { title: string }) {
    return this.svc.updateTitle(user.companyId, user.id, id, body.title);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.delete(user.companyId, user.id, id);
  }
}
