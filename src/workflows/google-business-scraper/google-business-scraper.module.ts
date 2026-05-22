import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { QueueModule } from "../../queue/queue.module";
import { ResourceIngestionModule } from "../../resource-ingestion/resource-ingestion.module";
import { WorkflowModule } from "../workflow.module";
import { GoogleFlaggedPage } from "./google-flagged-page.entity";
import { GoogleRootWebsite } from "./google-root-website.entity";
import { GoogleBusinessScraperController } from "./google-business-scraper.controller";
import { GoogleBusinessScraperService } from "./google-business-scraper.service";
import { LinkedInOutreachController } from "./linkedin-outreach.controller";
import { LinkedInOutreachService } from "./linkedin-outreach.service";
import { ProcessWebsiteQueueHandler } from "./process-website-queue.handler";

@Module({
  imports: [
    TypeOrmModule.forFeature([GoogleFlaggedPage, GoogleRootWebsite]),
    QueueModule,
    ResourceIngestionModule,
    WorkflowModule,
  ],
  controllers: [GoogleBusinessScraperController, LinkedInOutreachController],
  providers: [
    GoogleBusinessScraperService,
    LinkedInOutreachService,
    ProcessWebsiteQueueHandler,
  ],
  exports: [GoogleBusinessScraperService, LinkedInOutreachService],
})
export class GoogleBusinessScraperModule {}
