import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConnectorModule } from "../../connector/connector.module";
import { WorkflowModule } from "../workflow.module";
import { GitRepoService } from "./git-repo.service";
import { SeoBlogDraft } from "./seo-blog-draft.entity";
import { SeoHelperController } from "./seo-helper.controller";
import { SeoHelperService } from "./seo-helper.service";
import { RealBrowserService } from "src/resource-ingestion/real-browser";
import { BrowserService } from "src/resource-ingestion/browser.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([SeoBlogDraft]),
    WorkflowModule,
    ConnectorModule,
  ],
  controllers: [SeoHelperController],
  providers: [SeoHelperService, GitRepoService, RealBrowserService, BrowserService],
  exports: [SeoHelperService],
})
export class SeoHelperModule {}
