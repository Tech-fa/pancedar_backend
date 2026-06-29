import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectorModule } from '../connector/connector.module';
import { QueueModule } from '../queue/queue.module';
import { WorkflowRun } from '../workflows/workflow-run.entity';
import { Workflow } from '../workflows/workflow.entity';
import { WorkflowService } from '../workflows/workflow.service';

import { LinkedInLead } from '../workflows/linkedin-search-outreach/linkedin-lead.entity';
import { Team, TeamConfig, TeamMember } from './team.entity';
import { TeamController } from './team.controller';
import { TeamProcessesController } from './team-processes.controller';
import { LinkedInSearchOutreachTeamProcessService } from './linkedin-search-outreach-team-process.service';
import { TeamProcessingService } from './team-processing.service';
import { TeamService } from './team.service';
import { PermissionModule } from '../permissions/permission.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Team,
      TeamMember,
      TeamConfig,
      Workflow,
      WorkflowRun,
      LinkedInLead,
    ]),
  
    PermissionModule,
    ConnectorModule,
    QueueModule,
    CommonModule,
  ],
  providers: [
    TeamService,
    WorkflowService,
    TeamProcessingService,
    LinkedInSearchOutreachTeamProcessService,
  ],
  controllers: [TeamController, TeamProcessesController],
  exports: [TeamService],
})
export class TeamModule {}
