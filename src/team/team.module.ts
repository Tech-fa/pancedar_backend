import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectorModule } from '../connector/connector.module';
import { QueueModule } from '../queue/queue.module';
import { WorkflowRun } from '../workflows/workflow-run.entity';
import { Workflow } from '../workflows/workflow.entity';
import { WorkflowService } from '../workflows/workflow.service';
import {
  KijijiLink,
  KijijiLinkSchema,
} from '../workflows/kiji-link-tracking/schemas/kijiji-link.schema';
import { Team, TeamConfig, TeamMember } from './team.entity';
import { TeamController } from './team.controller';
import { TeamProcessesController } from './team-processes.controller';
import { TeamProcessingService } from './team-processing.service';
import { TeamService } from './team.service';
import { PermissionModule } from '../permissions/permission.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Team,
      TeamMember,
      TeamConfig,
      Workflow,
      WorkflowRun,
    ]),
    MongooseModule.forFeature([
      { name: KijijiLink.name, schema: KijijiLinkSchema },
    ]),
    PermissionModule,
    ConnectorModule,
    QueueModule,
  ],
  providers: [TeamService, WorkflowService, TeamProcessingService],
  controllers: [TeamController, TeamProcessesController],
  exports: [TeamService],
})
export class TeamModule {}
