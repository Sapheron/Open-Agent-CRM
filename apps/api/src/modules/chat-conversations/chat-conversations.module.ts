import { Module } from '@nestjs/common';
import { ChatConversationsController } from './chat-conversations.controller';
import { ChatConversationsService } from './chat-conversations.service';

@Module({
  controllers: [ChatConversationsController],
  providers: [ChatConversationsService],
  exports: [ChatConversationsService],
})
export class ChatConversationsModule {}
