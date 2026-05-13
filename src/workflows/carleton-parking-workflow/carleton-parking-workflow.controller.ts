import { Body, Controller, Logger, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TelegramWebhookUpdateDto } from "src/connector/telegram/dto";
import { assertValidWebhookRequest } from "src/connector/telegram/telegram-util";
import { Public } from "src/util/constants";
import { CarletonParkingWebhookHandler } from "./carleton-parking-webhook.handler";

@Controller("carleton-parking-workflow")
export class CarletonParkingWorkflowController {
  private readonly logger = new Logger(CarletonParkingWorkflowController.name);

  constructor(
    private readonly carletonParkingWebhookHandler: CarletonParkingWebhookHandler,
  ) {}

  @Post("webhook")
  @Public()
  async handleWebhook(
    @Req() req: Request,
    @Body() body: TelegramWebhookUpdateDto,
  ) {
    await assertValidWebhookRequest(req);
    try {
      await this.carletonParkingWebhookHandler.handleWebhook(body);
      return { ok: true };
    } catch (error) {
      this.logger.error("Failed to handle Carleton parking Telegram webhook", {
        message: (error as Error)?.message,
        stack: (error as Error)?.stack,
      });
      return { ok: false };
    }
  }
}
