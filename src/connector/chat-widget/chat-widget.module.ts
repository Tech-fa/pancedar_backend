import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CachingModule } from 'src/cache/cache.module';
import { QueueModule } from 'src/queue/queue.module';
import { RagModule } from 'src/rag/rag.module';
import { ServiceMappingModule } from 'src/service-mapping/service-mapping.module';
import { TeamModule } from 'src/team/team.module';
import { WorkflowModule } from 'src/workflows/workflow.module';
import { ConnectorModule } from '../connector.module';
import { ChatMessageEntity } from './chat-message.entity';
import { ChatWidgetController } from './chat-widget.controller';
import { ChatWidgetGateway } from './chat-widget.gateway';
import { ChatWidgetService } from './chat-widget.service';

@Module({
  imports: [
    ConfigModule,
    ConnectorModule,
    WorkflowModule,
    TeamModule,
    CachingModule,
    RagModule,
    QueueModule,
    ServiceMappingModule,
    TypeOrmModule.forFeature([ChatMessageEntity]),
  ],
  controllers: [ChatWidgetController],
  providers: [ChatWidgetService, ChatWidgetGateway],
  exports: [ChatWidgetService],
})
export class ChatWidgetModule {}
