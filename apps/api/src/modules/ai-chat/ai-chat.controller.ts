import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsArray, ValidateNested, IsString, IsEnum, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { AiChatService } from './ai-chat.service';
import { ChatConversationsService } from '../chat-conversations/chat-conversations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@wacrm/database';

class ChatMessageDto {
  @IsEnum(['system', 'user', 'assistant'])
  role: 'system' | 'user' | 'assistant';

  @IsString()
  content: string;
}

class AiChatBody {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @IsString() @IsOptional()
  conversationId?: string;
}

@ApiTags('ai-chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@Controller('ai/chat')
export class AiChatController {
  constructor(
    private readonly svc: AiChatService,
    private readonly convSvc: ChatConversationsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Chat with configured AI model (admin tool)' })
  async chat(@CurrentUser() user: User, @Body() body: AiChatBody) {
    // Save user message to conversation if conversationId provided
    if (body.conversationId) {
      const lastMsg = body.messages[body.messages.length - 1];
      if (lastMsg?.role === 'user') {
        await this.convSvc.addMessage(body.conversationId, {
          role: 'user', content: lastMsg.content,
        });
      }
    }

    const result = await this.svc.chat(user.companyId, body.messages, body.conversationId);

    // Save assistant response to conversation
    if (body.conversationId) {
      await this.convSvc.addMessage(body.conversationId, {
        role: 'assistant',
        content: result.content,
        toolCalls: result.actions?.length ? result.actions : undefined,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
      });
    }

    return result;
  }
}
