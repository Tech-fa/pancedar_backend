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
import {
  ApproveSeoBlogDto,
  TriggerSeoHelperRunDto,
  UpdateSeoBlogDraftDto,
} from "./dto";
import { SeoHelperService } from "./seo-helper.service";

@Controller()
export class SeoHelperController {
  private readonly logger = new Logger(SeoHelperController.name);

  constructor(private readonly seoHelperService: SeoHelperService) {}

  @Post("seo-helper/run")
  @hasPermission({ subject: workflowPermission.subject, actions: ["create"] })
  async run(
    @Req() req,
    @Body() body: TriggerSeoHelperRunDto,
    @Res() res: Response,
  ) {
    return formatResponse(
      this.logger,
      this.seoHelperService.runForWorkflow(req.user, body.workflowId),
      res,
      "SEO helper workflow started",
    );
  }

  @Get("seo-helper/drafts")
  @hasPermission({ subject: workflowPermission.subject, actions: ["read"] })
  async listDrafts(
    @Req() req,
    @Query("workflowRunId") workflowRunId: string | undefined,
    @Query("limit") limit: string,
    @Res() res: Response,
  ) {
    const n = Number(limit);
    return formatResponse(
      this.logger,
      this.seoHelperService.findDraftsForTeam(
        req.user.teamId,
        workflowRunId,
        Number.isFinite(n) ? n : undefined,
      ),
      res,
      "SEO blog drafts fetched",
    );
  }

  @Post("workflows/seo-helper/:workflowRunId/approve")
  @hasPermission({ subject: workflowPermission.subject, actions: ["update"] })
  async approve(
    @Req() req,
    @Res() res: Response,
    @Param("workflowRunId") workflowRunId: string,
    @Body() body: ApproveSeoBlogDto,
  ) {
    if (body.blogContent !== undefined || body.linkedinContent !== undefined) {
      await this.seoHelperService.updateDraftBeforeApproval(
        workflowRunId,
        req.user,
        body.blogContent,
        body.linkedinContent,
      );
    }
    return formatResponse(
      this.logger,
      this.seoHelperService.approveBlog(workflowRunId, req.user, body),
      res,
      "SEO blog approved and pushed to git",
    );
  }

  @Patch("workflows/seo-helper/:workflowRunId/draft")
  @hasPermission({ subject: workflowPermission.subject, actions: ["update"] })
  async updateDraft(
    @Req() req,
    @Res() res: Response,
    @Param("workflowRunId") workflowRunId: string,
    @Body() body: UpdateSeoBlogDraftDto,
  ) {
    return formatResponse(
      this.logger,
      this.seoHelperService.updateDraftBeforeApproval(
        workflowRunId,
        req.user,
        body.blogContent,
        body.linkedinContent,
      ),
      res,
      "SEO blog draft updated",
    );
  }
}
