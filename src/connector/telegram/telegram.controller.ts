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
import type { Request } from "express";
import { hasPermission } from "../../authentication/permission.decorator";
import { connectorPermission } from "../../permissions/permissions";
import { Public } from "../../util/constants";
import { TelegramWebhookUpdateDto } from "./dto";
import { TelegramService } from "./telegram.service";
import { formatResponse } from "src/util/helper-util";

@Controller("connector/telegram")
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(private readonly telegramService: TelegramService) {}

  @Post("webhook/:connectorId")
  @Public()
  async webhook(
    @Param("connectorId") connectorId: string,
    @Req() req: Request,
    @Body() update: TelegramWebhookUpdateDto,
  ): Promise<{ ok: true; messageId?: string }> {
    // this.telegramService.assertValidWebhookRequest(req);
    await this.telegramService.handleWebhookUpdate(connectorId, update);
    return { ok: true };
  }
}
