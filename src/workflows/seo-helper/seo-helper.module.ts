import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConnectorModule } from "../../connector/connector.module";
import { ResourceIngestionModule } from "../../resource-ingestion/resource-ingestion.module";
import { WorkflowModule } from "../workflow.module";
import { GitRepoService } from "./git-repo.service";
import { SeoBlogDraft } from "./seo-blog-draft.entity";
import { SeoHelperController } from "./seo-helper.controller";
import { SeoHelperService } from "./seo-helper.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([SeoBlogDraft]),
    ResourceIngestionModule,
    WorkflowModule,
    ConnectorModule,
  ],
  controllers: [SeoHelperController],
  providers: [SeoHelperService, GitRepoService],
  exports: [SeoHelperService],
})
export class SeoHelperModule {}
