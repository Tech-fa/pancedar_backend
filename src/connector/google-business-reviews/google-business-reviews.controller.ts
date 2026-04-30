import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";

import { Public } from "../../util/constants";
import { formatResponse } from "../../util/helper-util";
import { SelectGoogleBusinessLocationDto } from "./dto";
import { GoogleBusinessReviewsService } from "./google-business-reviews.service";

@Controller("google-business-reviews")
export class GoogleBusinessReviewsController {
  private readonly logger = new Logger(GoogleBusinessReviewsController.name);

  constructor(
    private readonly googleBusinessReviewsService: GoogleBusinessReviewsService,
  ) {}

  @Get("oauth")
  @Public()
  async getOAuthUrl(
    @Res() res: Response,
    @Query("connectorId") connectorId?: string,
  ): Promise<void> {
    try {
      const { url } = this.googleBusinessReviewsService.getAuthUrl(connectorId);
      res.redirect(url);
    } catch (error) {
      this.logger.error("Failed to create Google Business Profile OAuth URL", {
        message: error.message,
        stack: error.stack,
      });
      res.status(500).send("Failed to get auth url");
    }
  }

  @Get("verify")
  @Public()
  async verifyCode(
    @Res() res: Response,
    @Query("code") code: string,
    @Query("state") state?: string,
  ): Promise<void> {
    await this.googleBusinessReviewsService.verifyCode(code, state);
    res.send(
      `<!DOCTYPE html><html lang="en"><head></head><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: 'AUTH_SUCCESS'}, '*');
        }
        window.close();
      </script></body></html>`,
    );
  }

  @Get(":connectorId/accounts")
  async listAccounts(
    @Res() res: Response,
    @Param("connectorId") connectorId: string,
  ) {
    return formatResponse(
      this.logger,
      this.googleBusinessReviewsService.listAccounts(connectorId),
      res,
      "listing Google Business Profile accounts",
    );
  }

  @Get(":connectorId/locations")
  async listLocations(
    @Res() res: Response,
    @Param("connectorId") connectorId: string,
    @Query("accountName") accountName: string,
  ) {
    return formatResponse(
      this.logger,
      this.googleBusinessReviewsService.listLocations(connectorId, accountName),
      res,
      "listing Google Business Profile locations",
    );
  }

  @Post(":connectorId/location")
  async selectLocation(
    @Res() res: Response,
    @Param("connectorId") connectorId: string,
    @Body() body: SelectGoogleBusinessLocationDto,
  ) {
    return formatResponse(
      this.logger,
      this.googleBusinessReviewsService.selectLocation(connectorId, body),
      res,
      "selecting Google Business Profile location",
    );
  }

  @Get(":connectorId/reviews")
  async listReviews(
    @Res() res: Response,
    @Param("connectorId") connectorId: string,
    @Query("accountName") accountName?: string,
    @Query("locationName") locationName?: string,
    @Query("pageSize") pageSize?: string,
    @Query("pageToken") pageToken?: string,
    @Query("orderBy") orderBy?: string,
  ) {
    return formatResponse(
      this.logger,
      this.googleBusinessReviewsService.listReviews(connectorId, {
        accountName,
        locationName,
        pageSize: pageSize ? Number(pageSize) : undefined,
        pageToken,
        orderBy,
      }),
      res,
      "listing Google Business Profile reviews",
    );
  }

  @Post("disconnect")
  async disconnectConnector(
    @Res() res: Response,
    @Body() body: { connectorId: string },
  ) {
    return formatResponse(
      this.logger,
      this.googleBusinessReviewsService.disconnectConnector(body.connectorId),
      res,
      "disconnecting Google Business Profile reviews connector",
    );
  }
}
