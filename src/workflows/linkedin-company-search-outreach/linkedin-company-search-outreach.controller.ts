import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { hasPermission } from "../../authentication/permission.decorator";
import { workflowPermission } from "../../permissions/permissions";
import { formatResponse } from "../../util/helper-util";
import { TriggerLinkedInCompanySearchOutreachDto } from "./dto";
import { LinkedInCompanySearchOutreachService } from "./linkedin-company-search-outreach.service";

@Controller("linkedin-company-search-outreach")
export class LinkedInCompanySearchOutreachController {
  private readonly logger = new Logger(
    LinkedInCompanySearchOutreachController.name,
  );

  constructor(
    private readonly linkedInCompanySearchOutreach: LinkedInCompanySearchOutreachService,
  ) {}

  @Post("run")
  @hasPermission({ subject: workflowPermission.subject, actions: ["create"] })
  async run(
    @Req() req,
    @Body() body: TriggerLinkedInCompanySearchOutreachDto,
    @Res() res: Response,
  ) {
    return formatResponse(
      this.logger,
      this.linkedInCompanySearchOutreach.runForWorkflow(req.user, body),
      res,
      "LinkedIn company search outreach workflow started",
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
      this.linkedInCompanySearchOutreach.findLeadsForTeam(
        req.user.teamId,
        workflowRunId,
        Number.isFinite(n) ? n : undefined,
      ),
      res,
      "LinkedIn company search leads fetched",
    );
  }
}
