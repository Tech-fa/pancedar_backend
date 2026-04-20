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
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import type { Express, Response } from "express";
import { FilesInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { CategoryService } from "./category.service";
import { formatResponse } from "../util/helper-util";
import { hasPermission } from "../authentication/permission.decorator";
import { emailWorkflowCategoryPermission } from "../permissions/permissions";

@Controller("categories")
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
  @UseInterceptors(
    FilesInterceptor("files", 10, {
      storage: memoryStorage(),
      limits: { fileSize: 1024 * 1024 * 15 },
    }),
  )
  @hasPermission({
    subject: emailWorkflowCategoryPermission.subject,
    actions: ["create"],
  })
  async create(
    @Req() req,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    const clientId = req.user.clientId;
    return formatResponse(
      this.logger,
      this.categoryService.create(clientId, body, files),
      res,
      "Email category created successfully",
    );
  }

  @Put(":id")
  @UseInterceptors(
    FilesInterceptor("files", 10, {
      storage: memoryStorage(),
      limits: { fileSize: 1024 * 1024 * 15 },
    }),
  )
  @hasPermission({
    subject: emailWorkflowCategoryPermission.subject,
    actions: ["update"],
  })
  async update(
    @Req() req,
    @Res() res: Response,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    const clientId = req.user.clientId;
    return formatResponse(
      this.logger,
      this.categoryService.update(clientId, id, body, files),
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
