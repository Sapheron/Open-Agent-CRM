import { Module } from '@nestjs/common';
import { AiMemoryController } from './ai-memory.controller';
import { AiMemoryService } from './ai-memory.service';

@Module({
  controllers: [AiMemoryController],
  providers: [AiMemoryService],
  exports: [AiMemoryService],
})
export class AiMemoryModule {}
