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
import { TelegramWebhookUpdateDto } from "src/connector/telegram/dto";
import { KijijiLinkNotificationHandler } from "./kijiji-link-notification.handler";
import { Public } from "src/util/constants";
import { assertValidWebhookRequest } from "src/connector/telegram/telegram-util";

@Controller("kijiji-link-tracking")
export class KijijiLinkTrackingController {
  private readonly logger = new Logger(KijijiLinkTrackingController.name);

  constructor(
    private readonly kijijiLinkNotificationHandler: KijijiLinkNotificationHandler,
  ) {}

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
