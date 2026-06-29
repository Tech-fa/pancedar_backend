import { Body, Controller, Logger, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../../util/constants";
import { formatResponse } from "../../util/helper-util";
import { TestLinkedInOutreachDto } from "./dto";
import { LinkedInOutreachService } from "./linkedin-outreach.service";

@Controller("linkedin-outreach")
export class LinkedInOutreachController {
  private readonly logger = new Logger(LinkedInOutreachController.name);

  constructor(private readonly linkedInOutreach: LinkedInOutreachService) {}

  /**
   * Manual test endpoint for the full outreach flow (people scrape → profile pick → activity → message).
   * POST body: { companyLinkedInUrl, keywords, credentials?: { username, password } }
   */
  @Post("test")
  @Public()
  async testOutreach(
    @Body() body: TestLinkedInOutreachDto,
    @Res() res: Response,
  ) {
    return formatResponse(
      this.logger,
      this.linkedInOutreach.runOutreach(
        body.companyLinkedInUrl,
        body.keywords.join(", "),
        body.keywords.join(", "),
        body.credentials,
      ),
      res,
      "LinkedIn outreach test completed",
    );
  }
}
