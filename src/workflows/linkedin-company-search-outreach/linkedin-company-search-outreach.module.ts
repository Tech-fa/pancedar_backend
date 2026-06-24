import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CommonModule } from "../../common/common.module";
import { QueueModule } from "../../queue/queue.module";
import { ResourceIngestionModule } from "../../resource-ingestion/resource-ingestion.module";
import { TeamModule } from "../../team/team.module";
import { LinkedInOutreachService } from "../google-business-scraper/linkedin-outreach.service";
import { LinkedInLead } from "../linkedin-search-outreach/linkedin-lead.entity";
import { WorkflowModule } from "../workflow.module";
import { LinkedInCompanySearchOutreachController } from "./linkedin-company-search-outreach.controller";
import { LinkedInCompanySearchOutreachService } from "./linkedin-company-search-outreach.service";
import { ProcessLinkedInCompanyOutreachQueueHandler } from "./process-linkedin-company-outreach-queue.handler";

@Module({
  imports: [
    TypeOrmModule.forFeature([LinkedInLead]),
    WorkflowModule,
    CommonModule,
    TeamModule,
    QueueModule,
    ResourceIngestionModule,
  ],
  controllers: [LinkedInCompanySearchOutreachController],
  providers: [
    LinkedInCompanySearchOutreachService,
    LinkedInOutreachService,
    ProcessLinkedInCompanyOutreachQueueHandler,
  ],
  exports: [LinkedInCompanySearchOutreachService],
})
export class LinkedInCompanySearchOutreachModule {}
