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
import { Public } from "../../util/constants";
import { TelegramWebhookUpdateDto } from "./dto";
import { TelegramService } from "./telegram-ai-agent.service";
import { assertValidWebhookRequest } from "./telegram-util";

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
    assertValidWebhookRequest(req);
    await this.telegramService.handleWebhookUpdate(connectorId, update);
    return { ok: true };
  }
}
