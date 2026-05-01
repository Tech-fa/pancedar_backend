import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { hasPermission } from "../../authentication/permission.decorator";
import { kijijiLinksPermission } from "../../permissions/permissions";
import { formatResponse } from "../../util/helper-util";
import { KijijiLinkService } from "./kijiji-link.service";
import { TelegramWebhookUpdateDto } from "src/connector/telegram/dto";
import { KijijiLinkNotificationHandler } from "./kijiji-link-notification.handler";
import { Public } from "src/util/constants";
import { assertValidWebhookRequest } from "src/connector/telegram/telegram-util";

@Controller("kijiji-link-tracking")
export class KijijiLinkTrackingController {
  private readonly logger = new Logger(KijijiLinkTrackingController.name);

  constructor(
    private readonly kijijiLinkService: KijijiLinkService,
    private readonly kijijiLinkNotificationHandler: KijijiLinkNotificationHandler,
  ) {}

  @Get(":connectorId/links")
  @hasPermission({ subject: kijijiLinksPermission.subject, actions: ["read"] })
  async findByConnectorId(
    @Param("connectorId") connectorId: string,
    @Query("limit") limit: string,
    @Res() res: Response,
  ) {
    const parsedLimit = Number(limit);

    return formatResponse(
      this.logger,
      this.kijijiLinkService.findByConnectorId(
        connectorId,
        Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      ),
      res,
      `Kijiji links fetched for connector ${connectorId}`,
    );
  }

  @Post("webhook")
  @Public()
  async handleWebhook(
    @Req() req: Request,
    @Body() body: TelegramWebhookUpdateDto,
  ) {
    await assertValidWebhookRequest(req);
    try {
      await this.kijijiLinkNotificationHandler.handleWebhook(body);
      return { ok: true };
    } catch (error) {
      this.logger.error("Failed to handle Kijiji link notification webhook", {
        message: error?.message,
        stack: error?.stack,
      });

      return { ok: false };
    }
  }
}
