import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ConnectorModule } from '../connector.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [ConfigModule, ConnectorModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
