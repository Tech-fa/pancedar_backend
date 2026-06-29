import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CommonModule } from "../../common/common.module";
import { QueueModule } from "../../queue/queue.module";
import { TeamModule } from "../../team/team.module";
import { LinkedInOutreachService } from "../google-business-scraper/linkedin-outreach.service";
import { LinkedInLead } from "../linkedin-search-outreach/linkedin-lead.entity";
import { WorkflowModule } from "../workflow.module";
import { LinkedInCompanySearchOutreachController } from "./linkedin-company-search-outreach.controller";
import { LinkedInCompanySearchOutreachService } from "./linkedin-company-search-outreach.service";
import { ProcessLinkedInCompanyOutreachQueueHandler } from "./process-linkedin-company-outreach-queue.handler";
import { RealBrowserService } from "src/resource-ingestion/real-browser";

@Module({
  imports: [
    TypeOrmModule.forFeature([LinkedInLead]),
    WorkflowModule,
    CommonModule,
    TeamModule,
    QueueModule,
  ],
  controllers: [LinkedInCompanySearchOutreachController],
  providers: [
    LinkedInCompanySearchOutreachService,
    LinkedInOutreachService,
    ProcessLinkedInCompanyOutreachQueueHandler,
    RealBrowserService
  ],
  exports: [LinkedInCompanySearchOutreachService],
})
export class LinkedInCompanySearchOutreachModule {}
