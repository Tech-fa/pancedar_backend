import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TelegramController } from "./telegram.controller";
import { TelegramService } from "./telegram-ai-agent.service";
import { WorkflowModule } from "src/workflows/workflow.module";
import { ConnectorModule } from "../connector.module";
import { TelegramQueueHandler } from "./telegram-queue.handler";
import { CachingModule } from "src/cache/cache.module";
import { RagModule } from "src/rag/rag.module";
import { QueueModule } from "src/queue/queue.module";
import { ServiceMappingModule } from "src/service-mapping/service-mapping.module";
import { TeamModule } from "src/team/team.module";

@Module({
  imports: [
    ConfigModule,
    WorkflowModule,
    ConnectorModule,
    CachingModule,
    RagModule,
    QueueModule,
    ServiceMappingModule,
    TeamModule,
  ],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramQueueHandler],
  exports: [TelegramService],
})
export class TelegramModule {}
