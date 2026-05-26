import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CommonModule } from "../../common/common.module";
import { TeamModule } from "../../team/team.module";
import { WorkflowModule } from "../workflow.module";
import { LinkedInLead } from "./linkedin-lead.entity";
import { LinkedInSearchOutreachController } from "./linkedin-search-outreach.controller";
import { LinkedInSearchOutreachService } from "./linkedin-search-outreach.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([LinkedInLead]),
    WorkflowModule,
    CommonModule,
    TeamModule,
  ],
  controllers: [LinkedInSearchOutreachController],
  providers: [LinkedInSearchOutreachService],
  exports: [LinkedInSearchOutreachService],
})
export class LinkedInSearchOutreachModule {}
