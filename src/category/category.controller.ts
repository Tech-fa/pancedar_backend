import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { CategoryService } from "./category.service";
import { formatResponse } from "../util/helper-util";
import { hasPermission } from "../authentication/permission.decorator";
import { emailWorkflowCategoryPermission } from "../permissions/permissions";
import {
  CreateWorkflowEmailCategoryDto,
  UpdateWorkflowEmailCategoryDto,
} from "./dto";

@Controller("email-categories")
export class CategoryController {
  private readonly logger = new Logger(CategoryController.name);

  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @hasPermission({
    subject: emailWorkflowCategoryPermission.subject,
    actions: ["read"],
  })
  async list(@Req() req, @Res() res: Response) {
    const clientId = req.user.clientId;
    return formatResponse(
      this.logger,
      this.categoryService.findAll(clientId),
      res,
      "Email categories fetched successfully",
    );
  }

  @Get(":id")
  @hasPermission({
    subject: emailWorkflowCategoryPermission.subject,
    actions: ["read"],
  })
  async getById(@Req() req, @Res() res: Response, @Param("id") id: string) {
    const clientId = req.user.clientId;
    return formatResponse(
      this.logger,
      this.categoryService.findOne(clientId, id),
      res,
      "Email category fetched successfully",
    );
  }

  @Post()
  @hasPermission({
    subject: emailWorkflowCategoryPermission.subject,
    actions: ["create"],
  })
  async create(
    @Req() req,
    @Res() res: Response,
    @Body() dto: CreateWorkflowEmailCategoryDto,
  ) {
    const clientId = req.user.clientId;
    return formatResponse(
      this.logger,
      this.categoryService.create(clientId, dto),
      res,
      "Email category created successfully",
    );
  }

  @Put(":id")
  @hasPermission({
    subject: emailWorkflowCategoryPermission.subject,
    actions: ["update"],
  })
  async update(
    @Req() req,
    @Res() res: Response,
    @Param("id") id: string,
    @Body() dto: UpdateWorkflowEmailCategoryDto,
  ) {
    const clientId = req.user.clientId;
    return formatResponse(
      this.logger,
      this.categoryService.update(clientId, id, dto),
      res,
      "Email category updated successfully",
    );
  }

  @Delete(":id")
  @hasPermission({
    subject: emailWorkflowCategoryPermission.subject,
    actions: ["delete"],
  })
  async remove(@Req() req, @Res() res: Response, @Param("id") id: string) {
    const clientId = req.user.clientId;
    return formatResponse(
      this.logger,
      this.categoryService.delete(clientId, id),
      res,
      "Email category deleted successfully",
    );
  }
}
