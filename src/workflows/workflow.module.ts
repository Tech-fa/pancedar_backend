import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Workflow } from "./workflow.entity";
import { ConnectorModule } from "../connector/connector.module";
import { QueueModule } from "../queue/queue.module";
import { ServiceMappingModule } from "../service-mapping/service-mapping.module";
import { WorkflowService } from "./workflow.service";
import { WorkflowController } from "./workflow.controller";  

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workflow,
    ]),
    ConnectorModule,
    QueueModule,
    ServiceMappingModule,
  ],
  providers: [WorkflowService],
  controllers: [WorkflowController],
  exports: [WorkflowService],
})
export class WorkflowModule {}
