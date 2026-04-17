import { Controller, Logger, Param, Post, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { EmailAssistantService } from "./email-assistant.service";
import { formatResponse } from "../../util/helper-util";
import { hasPermission } from "../../authentication/permission.decorator";
import { workflowPermission } from "../../permissions/permissions";

@Controller("workflows/email-assistant")
export class EmailAssistantController {
  private readonly logger = new Logger(EmailAssistantController.name);

  constructor(private readonly emailAssistantService: EmailAssistantService) {}

  /**
   * Sends the drafted email for a workflow run that was left in awaiting_action
   * (approve-before-send). Publishes EMAIL_WORKFLOW_REPLY and marks the run completed.
   */
  @Post(":workflowRunId/send")
  @hasPermission({ subject: workflowPermission.subject, actions: ["update"] })
  async sendApprovedReply(
    @Req() req,
    @Res() res: Response,
    @Param("workflowRunId") workflowRunId: string,
  ) {
    return formatResponse(
      this.logger,
      this.emailAssistantService.sendApprovedReply(workflowRunId, req.user),
      res,
      "Send approved email-assistant reply",
    );
  }
}
