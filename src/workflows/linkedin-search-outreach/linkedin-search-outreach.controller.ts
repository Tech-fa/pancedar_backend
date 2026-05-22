import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { hasPermission } from "../../authentication/permission.decorator";
import { workflowPermission } from "../../permissions/permissions";
import { formatResponse } from "../../util/helper-util";
import { TriggerLinkedInSearchOutreachDto } from "./dto";
import { LinkedInSearchOutreachService } from "./linkedin-search-outreach.service";

@Controller("linkedin-search-outreach")
export class LinkedInSearchOutreachController {
  private readonly logger = new Logger(LinkedInSearchOutreachController.name);

  constructor(
    private readonly linkedInSearchOutreach: LinkedInSearchOutreachService,
  ) {}

  @Post("run")
  @hasPermission({ subject: workflowPermission.subject, actions: ["create"] })
  async run(
    @Req() req,
    @Body() body: TriggerLinkedInSearchOutreachDto,
    @Res() res: Response,
  ) {
    return formatResponse(
      this.logger,
      this.linkedInSearchOutreach.runForWorkflow(req.user, body.workflowId),
      res,
      "LinkedIn search outreach workflow started",
    );
  }

  @Get("leads")
  @hasPermission({ subject: workflowPermission.subject, actions: ["read"] })
  async listLeads(
    @Req() req,
    @Query("workflowRunId") workflowRunId: string | undefined,
    @Query("limit") limit: string,
    @Res() res: Response,
  ) {
    const n = Number(limit);
    return formatResponse(
      this.logger,
      this.linkedInSearchOutreach.findLeadsForTeam(
        req.user.teamId,
        workflowRunId,
        Number.isFinite(n) ? n : undefined,
      ),
      res,
      "LinkedIn leads fetched",
    );
  }
}
