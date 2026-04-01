import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { WsGatewayModule } from '../../gateway/ws-gateway.module';

@Module({
  imports: [WsGatewayModule],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
