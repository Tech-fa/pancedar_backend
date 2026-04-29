import { Module } from "@nestjs/common";
import { UsersModule } from "../../user/user.module";
import { CategoryModule } from "../../category/category.module";
import { QueueModule } from "../../queue/queue.module";
import { CategorizeEmailService } from "../steps/email/categorize.service";
import { ReplyEmailService } from "../steps/email/reply.service";
import { EmailAssistantService } from "./email-assistant.service";
import { EmailAssistantQueueHandler } from "./email-assistant-queue-handler.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Workflow } from "../workflow.entity";
import { WorkflowService } from "../workflow.service";
import { WorkflowRun } from "../workflow-run.entity";
import { EmailAssistantController } from "./email-assistant.controller";
import { ConnectorModule } from "../../connector/connector.module";
import { RagModule } from "../../rag/rag.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Workflow, WorkflowRun]),
    UsersModule,
    CategoryModule,
    QueueModule,
    ConnectorModule,
    RagModule,
  ],
  providers: [
    CategorizeEmailService,
    ReplyEmailService,
    EmailAssistantService,
    EmailAssistantQueueHandler,
    WorkflowService,
  ],
  controllers: [EmailAssistantController],
  exports: [EmailAssistantService],
})
export class EmailAssistantModule {}
