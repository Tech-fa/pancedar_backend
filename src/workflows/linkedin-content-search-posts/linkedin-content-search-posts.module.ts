import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CommonModule } from "../../common/common.module";
import { QueueModule } from "../../queue/queue.module";
import { RealBrowserService } from "../../resource-ingestion/real-browser";
import { TeamModule } from "../../team/team.module";
import { LinkedInOutreachService } from "../google-business-scraper/linkedin-outreach.service";
import { WorkflowModule } from "../workflow.module";
import { LinkedInContentPost } from "./linkedin-content-post.entity";
import { LinkedInContentSearchPostsController } from "./linkedin-content-search-posts.controller";
import { LinkedInContentSearchPostsService } from "./linkedin-content-search-posts.service";
import { ProcessLinkedInContentPostQueueHandler } from "./process-linkedin-content-post-queue.handler";

@Module({
  imports: [
    TypeOrmModule.forFeature([LinkedInContentPost]),
    WorkflowModule,
    CommonModule,
    TeamModule,
    QueueModule,
  ],
  controllers: [LinkedInContentSearchPostsController],
  providers: [
    LinkedInContentSearchPostsService,
    LinkedInOutreachService,
    ProcessLinkedInContentPostQueueHandler,
    RealBrowserService,
  ],
  exports: [LinkedInContentSearchPostsService],
})
export class LinkedInContentSearchPostsModule {}
