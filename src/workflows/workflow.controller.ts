import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
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
  FindWorkflowRunsQueryDto,
  UpdateWorkflowStepsDto,
  WorkflowRunStatus,
} from "./dto";

@Controller("workflows")
export class WorkflowController {
  private readonly logger = new Logger(WorkflowController.name);

  constructor(private readonly workflowService: WorkflowService) {}

  @Get("available")
  @hasPermission({ subject: workflowPermission.subject, actions: ["read"] })
  async findAvailableWorkflows(@Res() res: Response) {
    return formatResponse(
      this.logger,
      this.workflowService.findAvailableWorkflows(),
      res,
      "Available workflows fetched successfully",
    );
  }

  @Get("need-connectors")
  @hasPermission({ subject: workflowPermission.subject, actions: ["read"] })
  async findNeedConnectors(
    @Req() req,
    @Res() res: Response,
    @Query("onlyMissing") onlyMissing: boolean = false,
  ) {
    return formatResponse(
      this.logger,
      this.workflowService.findNeedConnectors(req.user, onlyMissing),
      res,
      "Need connectors fetched successfully",
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

  @Get(":id")
  @hasPermission({ subject: workflowPermission.subject, actions: ["read"] })
  async findOne(@Req() req, @Res() res: Response, @Param("id") id: string) {
    return formatResponse(
      this.logger,
      this.workflowService.findOne(req.user, id),
      res,
      "Workflow fetched successfully",
    );
  }

  @Get(":id/runs")
  @hasPermission({ subject: workflowPermission.subject, actions: ["read"] })
  async findRuns(
    @Req() req,
    @Res() res: Response,
    @Param("id") id: string,
    @Query() query: FindWorkflowRunsQueryDto,
  ) {
    return formatResponse(
      this.logger,
      this.workflowService.findWorkflowRuns(req.user, id, query),
      res,
      "Workflow runs fetched successfully",
    );
  }
  @Get("runs/:status")
  @hasPermission({ subject: workflowPermission.subject, actions: ["read"] })
  async findAwaitingActionRunsForAll(
    @Req() req,
    @Res() res: Response,
    @Param("id") id: string,
    @Query() query: FindWorkflowRunsQueryDto,
  ) {
    return formatResponse(
      this.logger,
      this.workflowService.findWorkflowRunsByStatuses(
        req.user,
        null,
        [req.params.status as WorkflowRunStatus],
        query,
      ),
      res,
      "Workflow action runs fetched successfully",
    );
  }

  @Get(":id/runs/:status")
  @hasPermission({ subject: workflowPermission.subject, actions: ["read"] })
  async findAwaitingActionRuns(
    @Req() req,
    @Res() res: Response,
    @Param("id") id: string,
    @Query() query: FindWorkflowRunsQueryDto,
  ) {
    return formatResponse(
      this.logger,
      this.workflowService.findWorkflowRunsByStatuses(
        req.user,
        id,
        [req.params.status as WorkflowRunStatus],
        query,
      ),
      res,
      `Workflow action runs fetched successfully for ${id}`,
    );
  }

  @Put(":id")
  @hasPermission({ subject: workflowPermission.subject, actions: ["update"] })
  async update(
    @Req() req,
    @Res() res: Response,
    @Param("id") id: string,
    @Body() dto: UpdateWorkflowStepsDto,
  ) {
    return formatResponse(
      this.logger,
      this.workflowService.updateSteps(req.user, id, dto),
      res,
      "Workflow updated successfully",
    );
  }

  @Delete(":id")
  @hasPermission({ subject: workflowPermission.subject, actions: ["delete"] })
  async remove(@Req() req, @Res() res: Response, @Param("id") id: string) {
    return formatResponse(
      this.logger,
      this.workflowService.delete(req.user, id),
      res,
      "Workflow deleted successfully",
    );
  }
}
