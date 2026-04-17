import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WorkflowEmailCategory } from "./category.entity";
import { CategoryService } from "./category.service";
import { CategoryController } from "./category.controller";
import { WorkflowEmailCategoryResource } from "./category-resource.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowEmailCategory,
      WorkflowEmailCategoryResource,
    ]),
  ],
  providers: [CategoryService],
  controllers: [CategoryController],
  exports: [CategoryService],
})
export class CategoryModule {}
