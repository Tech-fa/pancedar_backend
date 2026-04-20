import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WorkflowEmailCategory } from "./category.entity";
import { CategoryService } from "./category.service";
import { CategoryController } from "./category.controller";
import { WorkflowEmailCategoryResource } from "./category-resource.entity";
import { ResourceIngestionModule } from "../resource-ingestion/resource-ingestion.module";
import { CommonModule } from "../common/common.module";
import { RagModule } from "../rag/rag.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowEmailCategory,
      WorkflowEmailCategoryResource,
    ]),
    ResourceIngestionModule,
    CommonModule,
    RagModule,
  ],
  providers: [CategoryService],
  controllers: [CategoryController],
  exports: [CategoryService],
})
export class CategoryModule {}
