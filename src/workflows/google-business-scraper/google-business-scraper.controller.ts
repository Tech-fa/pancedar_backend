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
import { TriggerGoogleBusinessScrapeDto } from "./dto";
import { GoogleBusinessScraperService } from "./google-business-scraper.service";

@Controller("google-business-scraper")
export class GoogleBusinessScraperController {
  private readonly logger = new Logger(GoogleBusinessScraperController.name);

  constructor(private readonly scraperService: GoogleBusinessScraperService) {}

  @Post("scrape")
  @hasPermission({ subject: workflowPermission.subject, actions: ["create"] })
  async scrape(
    @Req() req,
    @Body() body: TriggerGoogleBusinessScrapeDto,
    @Res() res: Response,
  ) {
    return formatResponse(
      this.logger,
      this.scraperService.runScrapeForWorkflow(req.user, body.workflowId),
      res,
      "Google Maps scrape completed and website jobs queued",
    );
  }

  @Get("flagged-pages")
  @hasPermission({ subject: workflowPermission.subject, actions: ["read"] })
  async listFlagged(
    @Req() req,
    @Query("workflowRunId") workflowRunId: string | undefined,
    @Query("limit") limit: string,
    @Res() res: Response,
  ) {
    const n = Number(limit);
    return formatResponse(
      this.logger,
      this.scraperService.findFlaggedPagesForTeam(
        req.user.teamId,
        Number.isFinite(n) ? n : undefined,
        workflowRunId,
      ),
      res,
      "Google flagged pages fetched",
    );
  }
}
