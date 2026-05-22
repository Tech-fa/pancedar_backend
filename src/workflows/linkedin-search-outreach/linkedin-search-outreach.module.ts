import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ResourceIngestionModule } from "../../resource-ingestion/resource-ingestion.module";
import { WorkflowModule } from "../workflow.module";
import { GoogleBusinessScraperModule } from "../google-business-scraper/google-business-scraper.module";
import { LinkedInLead } from "./linkedin-lead.entity";
import { LinkedInSearchOutreachController } from "./linkedin-search-outreach.controller";
import { LinkedInSearchOutreachService } from "./linkedin-search-outreach.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([LinkedInLead]),
    ResourceIngestionModule,
    WorkflowModule,
    GoogleBusinessScraperModule,
  ],
  controllers: [LinkedInSearchOutreachController],
  providers: [LinkedInSearchOutreachService],
  exports: [LinkedInSearchOutreachService],
})
export class LinkedInSearchOutreachModule {}
