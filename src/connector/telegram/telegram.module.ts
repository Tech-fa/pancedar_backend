import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TelegramController } from "./telegram.controller";
import { TelegramService } from "./telegram.service";
import { WorkflowModule } from "src/workflows/workflow.module";
import { ConnectorModule } from "../connector.module";
import { TelegramQueueHandler } from "./telegram-queue.handler";
import { CachingModule } from "src/cache/cache.module";
import { RagModule } from "src/rag/rag.module";
import { QueueModule } from "src/queue/queue.module";
import { WorkflowRun } from "src/workflows/workflow-run.entity";
import { AgentCommunicationModule } from "src/agent-communication/agent-communication.module";
import { TelegramTimeoutCron } from "./telegram-timeout.cron";

@Module({
  imports: [
    ConfigModule,
    WorkflowModule,
    ConnectorModule,
    CachingModule,
    RagModule,
    QueueModule,
    TypeOrmModule.forFeature([WorkflowRun]),
    AgentCommunicationModule,
  ],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramQueueHandler, TelegramTimeoutCron],
  exports: [TelegramService],
})
export class TelegramModule {}
