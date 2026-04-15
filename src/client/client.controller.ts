import {
  Controller,
  Get,
  Logger,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Express, Request, Response } from "express";
import { ClientService } from "./client.service";
import { hasPermission } from "../authentication/permission.decorator";
import { clientPermission } from "../permissions/permissions";
import { formatResponse } from "../util/helper-util";

@Controller("clients")
export class ClientController {
  private readonly logger = new Logger(ClientController.name);

  constructor(private readonly clientService: ClientService) {}

  @Get("me")
  @hasPermission({ subject: clientPermission.subject, actions: ["read"] })
  async getClientAccount(@Req() req, @Res() res: Response) {
    const clientId = req.user.clientId;
    return formatResponse(
      this.logger,
      this.clientService.getClientAccount(clientId),
      res,
      "Client fetched successfully",
    );
  }

  @Post("logo")
  @UseInterceptors(
    FileInterceptor("logo", {
      storage: memoryStorage(),
      limits: { fileSize: 1024 * 1024 * 5 },
    }),
  )
  @hasPermission({ subject: clientPermission.subject, actions: ["update"] })
  async uploadClientLogo(
    @UploadedFile() logo: Express.Multer.File,
    @Req() req,
    @Res() res: Response,
  ) {
    const clientId = req.user.clientId;
    return formatResponse(
      this.logger,
      this.clientService.updateClientLogo(clientId, logo),
      res,
      "Client logo updated successfully",
    );
  }
}
