import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { timingSafeEqual } from "crypto";
import type { Request } from "express";
import { ConnectorService } from "../connector.service";
import {
  TelegramMessageDto,
  TelegramWebhookRegistrationResult,
  TelegramWebhookUpdateDto,
} from "./dto";
import { WorkflowService } from "src/workflows/workflow.service";
import { CacheService } from "src/cache/cache.service";
import { LlmAgent, LlmAgentState } from "src/llm-integration/llm-agent";
import { decrypt } from "src/util/helper-util";
import { QueuePublisher } from "src/queue/queue.publisher";
import { RagRetrievalService } from "src/rag/rag-retrieval.service";
import { SERVICE_MAP } from "src/service-mapping/service.map";

export const TELEGRAM_CACHE_PREFIX = "telegram";

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly workflowService: WorkflowService,
    private readonly cacheService: CacheService,
    private readonly connectorService: ConnectorService,
    private readonly ragRetrievalService: RagRetrievalService,
    private readonly queuePublisher: QueuePublisher,
    @Inject(SERVICE_MAP)
    private readonly serviceMap: Record<
      string,
      { [key: string]: (...args: any[]) => Promise<any> }
    >,
  ) {}

  isEnabled(): boolean {
    const enabled = this.config.get<string>("TELEGRAM_ENABLED");
    return enabled === "true" || enabled === "1";
  }

  assertValidWebhookRequest(req: Request): void {
    const expectedSecret = this.config.get<string>("TELEGRAM_WEBHOOK_SECRET");
    if (!expectedSecret?.trim()) {
      return;
    }

    const receivedSecret = req.get("x-telegram-bot-api-secret-token");
    if (
      !receivedSecret ||
      !this.secureCompare(receivedSecret, expectedSecret.trim())
    ) {
      throw new UnauthorizedException("Invalid Telegram webhook secret");
    }
  }

  async handleWebhookUpdate(
    connectorId: string,
    update: TelegramWebhookUpdateDto,
  ): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.warn(
        "Telegram webhook received while TELEGRAM_ENABLED is off",
      );
      return null;
    }
    const message = this.extractMessage(update);
    if (!message?.chat?.id || !message.message_id) {
      this.logger.debug(
        `Skipping unsupported Telegram update ${update.update_id}`,
      );
      return null;
    }

    const chatId = String(message.chat.id);
    try {
      const cacheKey = `${TELEGRAM_CACHE_PREFIX}_${chatId}`;
      const initialState = JSON.parse(
        (await this.cacheService.getData(cacheKey)) ?? "{}",
      );
      let startedAt;
      if (!Object.keys(initialState).length) {
        startedAt = Date.now();
      } else {
        startedAt = initialState.startedAt;
      }
      const run = await this.workflowService.createOrGetWorkflowRun({
        connectorId,
        context: {
          chatId,
          userId: message.from?.username,
          startedAt,
        },
        displayContext: {
          userId: message.from?.username,
          startedAt,
        },
      });
      const agent = new LlmAgent(
        this.config,
        this.ragRetrievalService,
        this.queuePublisher,
        this.serviceMap,
        {
          source: run.id,
          teamId: run.workflow?.teamId,
          skipPartialToken: true,
          mission: run.workflow?.steps.find(
            (step) => step.name === "Reply to Message",
          )?.values.assistantMission,
          availableActions: run.workflow?.steps.find(
            (step) => step.name === "Reply to Message",
          )?.allowedActions,
          onStateChange: (state: LlmAgentState) => {
            this.cacheService.setData(
              cacheKey,
              JSON.stringify({ ...state, startedAt }),
              3600 * 2,
            );
          },
          initialState,
        },
      );
      agent.handleTurn(
        {
          sendFullToken: (token: string) => {
            if (token.trim()) {
              this.sendMessage(connectorId, chatId, token);
            }
          },
          sendPartialToken: (token: string) => {},
          sendEmptyToken: () => {},
          endConversation: () => {},
        },
        message.text,
      );
    } catch (error) {
      this.logger.error("Failed to handle Telegram webhook update", {
        message: error.message,
        stack: error.stack,
      });
      return null;
    }
  }

  async registerWebhook(
    botToken: string,
    connectorId: string,
  ): Promise<TelegramWebhookRegistrationResult> {
    const url = `${this.webhookUrl()}/${connectorId}`;
    const secretToken = this.config.get<string>("TELEGRAM_WEBHOOK_SECRET");

    const response = await axios.post<TelegramWebhookRegistrationResult>(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        url,
        secret_token: secretToken?.trim() || undefined,
        allowed_updates: [
          "message",
          "edited_message",
          "channel_post",
          "edited_channel_post",
        ],
      },
    );

    return response.data;
  }

  async sendMessage(
    connectorId: string,
    chatId: string | number,
    text: string,
    options?: {
      replyToMessageId?: number;
    },
  ): Promise<{ messageId: number }> {
    const connector = await this.connectorService.findOneById(connectorId);
    const botToken = await decrypt(
      connector?.credentials?.["Telegram Bot Secret"],
    );
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };
    if (options?.replyToMessageId !== undefined) {
      body.reply_to_message_id = options.replyToMessageId;
    }
    try {
      const { data } = await axios.post<{
        ok: boolean;
        result?: { message_id: number };
        description?: string;
      }>(`https://api.telegram.org/bot${botToken}/sendMessage`, body);

      if (!data.ok || data.result?.message_id === undefined) {
        this.logger.warn(
          `Telegram sendMessage failed: ${data.description ?? "unknown"}`,
        );
        this.logger.error("Telegram sendMessage failed", { data });
        throw new BadRequestException(
          data.description ?? "Telegram sendMessage failed",
        );
      }
      return { messageId: data.result.message_id };
    } catch (error) {
      this.logger.error("Telegram sendMessage failed", {
        message: error.message,
        stack: error.stack,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new BadRequestException(error.message);
    }
  }

  webhookUrl(): string {
    const apiUrl = this.config.get<string>("API_URL");
    if (!apiUrl?.trim()) {
      throw new BadRequestException("API_URL is not configured");
    }
    return `${apiUrl.replace(/\/$/, "")}/connector/telegram/webhook`;
  }

  private extractMessage(
    update: TelegramWebhookUpdateDto,
  ): TelegramMessageDto | undefined {
    return (
      update.message ??
      update.edited_message ??
      update.channel_post ??
      update.edited_channel_post
    );
  }

  private extractAttachments(
    message: TelegramMessageDto,
  ): Record<string, any>[] {
    const attachments: Record<string, any>[] = [];
    const fields = [
      "photo",
      "document",
      "audio",
      "voice",
      "video",
      "video_note",
      "sticker",
      "contact",
      "location",
      "venue",
    ] as const;

    for (const field of fields) {
      const value = message[field];
      if (value !== undefined) {
        attachments.push({ type: field, value });
      }
    }

    return attachments;
  }

  private userDisplayName(user?: {
    first_name?: string;
    last_name?: string;
    username?: string;
  }): string | null {
    if (!user) {
      return null;
    }
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
    return name || user.username || null;
  }

  private chatDisplayName(chat: {
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  }): string | null {
    const directName = [chat.first_name, chat.last_name]
      .filter(Boolean)
      .join(" ");
    return chat.title || directName || chat.username || null;
  }

  private secureCompare(received: string, expected: string): boolean {
    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);
    return (
      receivedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(receivedBuffer, expectedBuffer)
    );
  }
}
