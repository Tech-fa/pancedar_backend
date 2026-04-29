import { Controller, Get, Logger, Param, Res } from "@nestjs/common";
import { Response } from "express";
import { hasPermission } from "../authentication/permission.decorator";
import { workflowPermission } from "../permissions/permissions";
import { formatResponse } from "../util/helper-util";
import { AgentCommunicationService } from "./agent-communication.service";

@Controller("agent-communications")
export class AgentCommunicationController {
  private readonly logger = new Logger(AgentCommunicationController.name);

  constructor(
    private readonly agentCommunicationService: AgentCommunicationService,
  ) {}

  @Get("workflow-runs/:workflowRunId")
  @hasPermission({ subject: workflowPermission.subject, actions: ["read"] })
  async findByWorkflowRunId(
    @Param("workflowRunId") workflowRunId: string,
    @Res() res: Response,
  ) {
    return formatResponse(
      this.logger,
      this.agentCommunicationService.findByWorkflowRunId(workflowRunId),
      res,
      `Agent communications fetched for workflow run ${workflowRunId}`,
    );
  }
}
