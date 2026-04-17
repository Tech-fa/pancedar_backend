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

@Module({
  imports: [
    TypeOrmModule.forFeature([Workflow, WorkflowRun]),
    QueueModule,
    UsersModule,
    ConnectorModule,
  ],
  providers: [WorkflowService, WorkflowQueueHandler],
  controllers: [WorkflowController],
  exports: [WorkflowService],
})
export class WorkflowModule {}
