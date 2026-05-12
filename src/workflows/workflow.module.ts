import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Workflow } from "./workflow.entity";
import { QueueModule } from "../queue/queue.module";
import { WorkflowService } from "./workflow.service";
import { WorkflowController } from "./workflow.controller";
import { WorkflowQueueHandler } from "./workflow-queue-handler.service";
import { WorkflowRun } from "./workflow-run.entity";
import { UsersModule } from "../user/user.module";
import { ConnectorModule } from "../connector/connector.module";
import { WorkflowRunHandler } from "./workflow-run-handler.service";
import { CommonModule } from "../common/common.module";
import { TeamConfig } from "../team/team.entity";
import { TeamModule } from "../team/team.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Workflow, WorkflowRun]),
    QueueModule,
    UsersModule,
    ConnectorModule,
    CommonModule,
    TeamModule,
  ],
  providers: [WorkflowService, WorkflowQueueHandler, WorkflowRunHandler],
  controllers: [WorkflowController],
  exports: [WorkflowService],
})
export class WorkflowModule {}
