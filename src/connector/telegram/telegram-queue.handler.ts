import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { Injectable, Logger } from "@nestjs/common";
import { ConnectorService } from "../connector.service";
import { Events, getListening } from "../../queue/queue-constants";
import { Public } from "../../util/constants";
import { decrypt } from "../../util/helper-util";
import { TelegramService } from "./telegram.service";

@Injectable()
export class TelegramQueueHandler {
  private readonly logger = new Logger(TelegramQueueHandler.name);

  constructor(
    private readonly connectorService: ConnectorService,
    private readonly telegramService: TelegramService,
  ) {}

  @RabbitSubscribe(getListening(Events.CONFIGURE_TELEGRAM))
  @Public()
  async handleConfigureTelegram(payload: { connectorId: string }) {
    try {
      if (!payload?.connectorId) {
        this.logger.warn(
          "Skipping telegram configuration: connectorId missing",
        );
        return;
      }

      const connector = await this.connectorService.findOneById(
        payload.connectorId,
      );

      const encryptedBotToken =
        connector?.credentials?.botToken ??
        connector?.credentials?.["Telegram Bot Secret"];

      if (!encryptedBotToken) {
        this.logger.warn(
          `Skipping telegram configuration for ${payload.connectorId}: botToken missing`,
        );
        return;
      }

      const botToken = await decrypt(encryptedBotToken);
      const webhookUrl = this.telegramService.webhookUrl();
      try {
        await this.telegramService.registerWebhook(
          botToken,
          payload.connectorId,
        );
        this.logger.log(
          `Configured Telegram webhook for connector ${payload.connectorId}: ${webhookUrl}`,
        );
      } catch (error) {
        this.logger.error(
          `Error configuring Telegram webhook for connector ${payload?.connectorId}`,
          error?.stack,
        );
        return;
      }
    } catch (error) {
      this.logger.error(
        `Error configuring Telegram webhook for connector ${payload?.connectorId}`,
        error?.stack,
      );
      return;
    }
  }
}
