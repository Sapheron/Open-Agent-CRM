import { Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { WaRedisBridgeService } from './wa-redis-bridge.service';
import { AuthModule } from '../modules/auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [WsGateway, WaRedisBridgeService],
  exports: [WsGateway],
})
export class WsGatewayModule {}
