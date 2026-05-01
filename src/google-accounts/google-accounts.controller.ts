import { Controller, Get, Logger, Res } from "@nestjs/common";
import { Response } from "express";
import { hasPermission } from "../authentication/permission.decorator";
import { googleAccountsPermission } from "../permissions/permissions";
import { formatResponse } from "../util/helper-util";
import { GoogleAccountsService } from "./google-accounts.service";

@Controller("google-accounts")
export class GoogleAccountsController {
  private readonly logger = new Logger(GoogleAccountsController.name);

  constructor(private readonly googleAccountsService: GoogleAccountsService) {}

  @Get()
  @hasPermission({ subject: googleAccountsPermission.subject, actions: ["read"] })
  async findAll(@Res() res: Response) {
    return formatResponse(
      this.logger,
      this.googleAccountsService.findAll(),
      res,
      "Google accounts fetched",
    );
  }
}
