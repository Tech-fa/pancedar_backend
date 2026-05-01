import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ConnectorService } from "../connector.service";
import {
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
import {
  extractMessage,
  registerWebhook,
  sendMessage as sendTelegramMessage,
} from "./telegram-util";

export const TELEGRAM_CACHE_PREFIX = "telegram-ai-agent";

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
    const message = extractMessage(update);
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
    return registerWebhook(botToken, `${this.webhookUrl()}/${connectorId}`);
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
    try {
      return await sendTelegramMessage(chatId, text, {
        botToken,
        ...(options ?? {}),
      });
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
}
