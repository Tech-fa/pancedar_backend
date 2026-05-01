import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { Injectable, Logger } from "@nestjs/common";
import { TelegramWebhookUpdateDto } from "src/connector/telegram/dto";
import {
  extractMessage,
  sendMessage,
} from "src/connector/telegram/telegram-util";
import { Events, getListening } from "src/queue/queue-constants";
import { Public } from "src/util/constants";
import { WorkflowService } from "../workflow.service";
import { Workflow } from "../workflow.entity";

interface NewKijijiItemPayload {
  workflowId?: string;
  links: string[];
  collectedAt: string;
}

@Injectable()
export class KijijiLinkNotificationHandler {
  private readonly logger = new Logger(KijijiLinkNotificationHandler.name);

  constructor(private readonly workflowService: WorkflowService) {}

  @RabbitSubscribe(getListening(Events.NEW_KIJIJI_ITEM))
  @Public()
  async handleNewKijijiItem(payload: NewKijijiItemPayload): Promise<void> {
    try {
      if (!payload?.workflowId) {
        this.logger.warn(
          `Skipping Kijiji notification for ${payload?.workflowId}: workflowId missing`,
        );
        return;
      }
      if (!payload?.links?.length) {
        this.logger.warn(
          `Skipping Kijiji notification for ${payload?.workflowId}: links missing`,
        );
        return;
      }
      const workflowRun = await this.workflowService.findWorkflowRunByWorkflowId(
        payload.workflowId,
      );
      await sendMessage(
        workflowRun.context.chatId,
        this.formatMessage(payload),
        {
          botToken: process.env.TELEGRAM_BOT_TOKEN,
        },
      );
    } catch (error) {
      this.logger.error("Failed to send Kijiji Telegram notification", {
        message: error?.message,
        stack: error?.stack,
      });
    }
  }

  async handleWebhook(body: TelegramWebhookUpdateDto): Promise<void> {
    const message = extractMessage(body);
    const username = message?.from?.username;
    const workflowRun = await this.workflowService.createWorkflowRunFromPrimaryIdentifier(
      {
        primaryIdentifier: username,
        workflowName: "kijiji-notifier",
        connectorTypeId: "kijiji",
        injectContext: (workflow: Workflow) => {
          return {
            chatId: message?.chat?.id,
          };
        },
        displayContext: {},
      },
    );
    console.log("workflowRun", workflowRun);
  }

  private formatMessage(payload: NewKijijiItemPayload): string {
    const linkText = payload.links.map((link) => `- ${link}`).join("\n");
    return [
      `New Kijiji item${payload.links.length === 1 ? "" : "s"} found`,
      linkText,
    ].join("\n");
  }
}
