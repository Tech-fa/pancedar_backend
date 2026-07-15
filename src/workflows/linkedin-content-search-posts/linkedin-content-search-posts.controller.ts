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
import { TriggerLinkedInContentSearchPostsDto } from "./dto";
import { LinkedInContentSearchPostsService } from "./linkedin-content-search-posts.service";

@Controller("linkedin-content-search-posts")
export class LinkedInContentSearchPostsController {
  private readonly logger = new Logger(
    LinkedInContentSearchPostsController.name,
  );

  constructor(
    private readonly linkedInContentSearchPosts: LinkedInContentSearchPostsService,
  ) {}

  @Post("run")
  @hasPermission({ subject: workflowPermission.subject, actions: ["create"] })
  async run(
    @Req() req,
    @Body() body: TriggerLinkedInContentSearchPostsDto,
    @Res() res: Response,
  ) {
    return formatResponse(
      this.logger,
      this.linkedInContentSearchPosts.runForWorkflow(req.user, body),
      res,
      "LinkedIn content search posts workflow started",
    );
  }

  @Get("posts")
  @hasPermission({ subject: workflowPermission.subject, actions: ["read"] })
  async listPosts(
    @Req() req,
    @Query("workflowRunId") workflowRunId: string | undefined,
    @Query("limit") limit: string,
    @Res() res: Response,
  ) {
    const n = Number(limit);
    return formatResponse(
      this.logger,
      this.linkedInContentSearchPosts.findPostsForTeam(
        req.user.teamId,
        workflowRunId,
        Number.isFinite(n) ? n : undefined,
      ),
      res,
      "LinkedIn content posts fetched",
    );
  }
}
