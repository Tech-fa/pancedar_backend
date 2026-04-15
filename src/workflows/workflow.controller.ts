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
import { WorkflowService } from "./workflow.service";
import { formatResponse } from "../util/helper-util";
import { hasPermission } from "../authentication/permission.decorator";
import { workflowPermission } from "../permissions/permissions";
import {
  CreateWorkflowDto,
  GetConditionFieldsDto,
  WorkflowTriggerDto,
} from "./dto";

@Controller("workflows")
export class WorkflowController {
  private readonly logger = new Logger(WorkflowController.name);

  constructor(private readonly workflowService: WorkflowService) {}

  @Get("available")
  @hasPermission({ subject: workflowPermission.subject, actions: ["read"] })
  async findAvailableWorkflows(@Req() req, @Res() res: Response) {
    return formatResponse(
      this.logger,
      this.workflowService.findAvailableWorkflows(req.user),
      res,
      "Available workflows fetched successfully",
    );
  }

  @Get()
  @hasPermission({ subject: workflowPermission.subject, actions: ["read"] })
  async findAll(@Req() req, @Res() res: Response) {
    return formatResponse(
      this.logger,
      this.workflowService.findAll(req.user),
      res,
      "Workflows fetched successfully",
    );
  }

  @Post()
  @hasPermission({ subject: workflowPermission.subject, actions: ["create"] })
  async create(
    @Req() req,
    @Res() res: Response,
    @Body() dto: CreateWorkflowDto,
  ) {
    return formatResponse(
      this.logger,
      this.workflowService.create(req.user, dto),
      res,
      "Workflow created successfully",
    );
  }

  @Delete(":id")
  @hasPermission({ subject: workflowPermission.subject, actions: ["delete"] })
  async remove(@Req() req, @Res() res: Response, @Param("id") id: string) {
    const clientId = req.user.clientId;
    return formatResponse(
      this.logger,
      this.workflowService.delete(clientId, id),
      res,
      "Workflow deleted successfully",
    );
  }
}
