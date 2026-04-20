import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  Response,
  UseGuards,
} from "@nestjs/common";
import { GoogleSerivce } from "./google.service";
import { UsersService } from "../../user/user.service";
import { Public } from "../../util/constants";
import { formatResponse } from "../../util/helper-util";

@Controller("gmail")
export class GoogleController {
  constructor(
    private readonly googleService: GoogleSerivce,
  ) {}

  private readonly logger = new Logger(GoogleController.name);

  @Get("oauth")
  @Public()
  async getUrl(@Res() res, @Query("connectorId") connectorId?: string) {
    try {
      const { url } = await this.googleService.getGoogleAuth(connectorId);
      return res.redirect(url);
    } catch (err) {
      this.logger.error(`getting auth url failed`, err);
      return res.status(500).send("Failed to get auth url");
    }
  }

  // Get Google OAuth URL for adding new inbox to authenticated user
  @Get("url/add-inbox")
  async getUrlForAddInbox(@Res() res, @Req() req) {
    // Pass the user's email to link the new inbox to this user
    return formatResponse(
      this.logger,
      this.googleService.getGoogleAuth(req.user.username),
      res,
      `getting auth url for adding inbox`
    );
  }

  @Public()
  @Get("verify")
  async verifyCode(
    @Res() res,
    @Query("code") code: string,
    @Query("state") state?: string
  ) {
    await this.googleService.verifyCode(code, state);
    res.send(
      `<!DOCTYPE html><html lang="en"><head></head><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: 'AUTH_SUCCESS'}, '*');
        }
        window.close();
      </script></body></html>`
    );
  }

  // Delete credential (disconnect inbox)
  @Delete("connectors/:id")
  async deleteCredential(
    @Res() res,
    @Req() req,
    @Param("id") connectorId: string
  ) {
    return formatResponse(
      this.logger,
      this.googleService.disconnectConnector(connectorId),
      res,
      "disconnecting inbox"
    );
  }
}
