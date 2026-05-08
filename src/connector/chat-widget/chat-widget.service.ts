import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { Repository } from "typeorm";
import { CacheService } from "src/cache/cache.service";
import { PaginatedResponse } from "src/common/pagination.dto";
import { ConnectorService } from "src/connector/connector.service";
import { decrypt } from "src/util/helper-util";
import { TeamService } from "src/team/team.service";
import { LlmAgentState } from "src/llm-integration/llm-agent";
import { WorkflowRun } from "src/workflows/workflow-run.entity";
import { WorkflowService } from "src/workflows/workflow.service";
import { ChatMessageEntity, ChatMessageSentBy } from "./chat-message.entity";
import {
  ActionPerformedChatWidgetDto,
  ChatWidgetMessagesQueryDto,
  InitChatWidgetDto,
  InitChatWidgetResponse,
  RegisterChatWidgetDto,
  RegisterChatWidgetResponse,
} from "./dto";

export const CHAT_WIDGET_CACHE_PREFIX = "chat_widget";
export const CHAT_WIDGET_WS_PATH = "/connector/chat-widget/ws";

@Injectable()
export class ChatWidgetService {
  constructor(
    private readonly config: ConfigService,
    private readonly connectorService: ConnectorService,
    private readonly workflowService: WorkflowService,
    private readonly teamService: TeamService,
    private readonly cacheService: CacheService,
    @InjectRepository(ChatMessageEntity)
    private readonly chatMessageRepo: Repository<ChatMessageEntity>,
  ) {}

  async registerChat(
    dto: RegisterChatWidgetDto,
    headers: {
      signature?: string;
      timestamp?: string;
    },
  ): Promise<RegisterChatWidgetResponse> {
    const appName = dto.appName.trim();
    const sessionId = dto.sessionId?.trim() || randomUUID();
    const connector = await this.connectorService.findOneByPrimaryIdentifier(
      appName,
      "Chat Widget",
    );
    if (!connector) {
      throw new NotFoundException("Chat widget connector not found");
    }

    await this.assertValidSignature({
      signature: headers.signature,
      timestamp: headers.timestamp,
      secret: await decrypt(connector.credentials?.["Web App Secret"]),
    });

    const [workflowRun, teamConfig] = await Promise.all([
      this.workflowService.createOrGetWorkflowRun({
        connectorId: connector.id,
        context: {
          appName,
          sessionId,
        },
        displayContext: {
          appName,
          sessionId,
        },
      }),
      this.teamService.getConfigFromConnectorPrimaryIdentifier(
        appName,
        "Chat Widget",
        "chatBot",
      ),
    ]);

    await this.cacheRunContext(workflowRun, teamConfig);

    return {
      runId: workflowRun.id,
      websocketUrl: this.buildWebSocketUrl(workflowRun.id),
      greetingMessage:
        workflowRun.workflow?.steps?.find(
          (step) => step.name === "Establish Connection",
        )?.values?.greetingMessage ?? "hello, how can i help you today?",
    };
  }

  async actionPerformed(
    dto: ActionPerformedChatWidgetDto,
    headers: {
      signature?: string;
      timestamp?: string;
    },
  ): Promise<void> {
    const appName = dto.appName.trim();
    const connector = await this.connectorService.findOneByPrimaryIdentifier(
      appName,
      "Chat Widget",
    );
    if (!connector) {
      throw new NotFoundException("Chat widget connector not found");
    }
    await this.assertValidSignature({
      signature: headers.signature,
      timestamp: headers.timestamp,
      secret: await decrypt(connector.credentials?.["Web App Secret"]),
    });
    const workflowRun = await this.workflowService.getWorkflowRunByContext({
      connectorId: connector.id,
      context: {
        appName: dto.appName,
        sessionId: dto.sessionId,
      },
    });
    if (!workflowRun) {
      throw new NotFoundException("Chat widget workflow run not found");
    }
    await this.workflowService.updateWorkflowRun(workflowRun.id, {
      stepsContext: {
        Chatting: {
          actionInfo: dto.actionInfo,
        },
      },
    });
  }

  async initWidget(dto: InitChatWidgetDto): Promise<InitChatWidgetResponse> {
    const appName = dto.appName.trim();
    const connector = await this.connectorService.findOneByPrimaryIdentifier(
      appName,
      "Chat Widget",
    );
    if (!connector) {
      throw new NotFoundException("Chat widget connector not found");
    }
    const hideCircle = connector.credentials?.["Hide Circle"];

    return {
      colorTheme: connector.credentials?.["Chat Widget Color"] ?? "",
      chatIcon: connector.credentials?.["Chat Icon"] ?? "",
      hideCircle: hideCircle === true || hideCircle === "true",
      assistantName:
        connector.credentials?.["Assistant Name"] ?? "Chat Support",
      assistantIcon: connector.credentials?.["Assistant Icon"] ?? "",
    };
  }

  async findMessages(
    runId: string,
    query: ChatWidgetMessagesQueryDto,
  ): Promise<PaginatedResponse<ChatMessageEntity>> {
    const page = Math.max(1, query.page ?? 1);
    const perPage = Math.max(1, Math.min(query.perPage ?? 10, 100));

    await this.assertChatWidgetRun(runId);

    const [data, totalCount] = await this.chatMessageRepo.findAndCount({
      where: { workflowRunId: runId },
      order: { createdAt: "DESC" },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    return {
      data,
      currentPage: page,
      totalCount,
      perPage,
    };
  }

  async assertChatWidgetRun(runId: string): Promise<WorkflowRun> {
    if (!runId) {
      throw new BadRequestException("runId is required");
    }
    const run = await this.workflowService.findWorkflowRunById(runId);
    if (!run) {
      throw new NotFoundException("Chat widget run not found");
    }
    return run;
  }

  async saveMessage({
    runId,
    message,
    sentBy,
    teamMemberId = null,
  }: {
    runId: string;
    message: string;
    sentBy: ChatMessageSentBy;
    teamMemberId?: string | null;
  }): Promise<ChatMessageEntity> {
    return this.chatMessageRepo.save(
      new ChatMessageEntity({
        workflowRunId: runId,
        message,
        sentBy,
        teamMemberId,
        createdAt: Date.now(),
      }),
    );
  }

  async loadAgentContext(runId: string): Promise<Record<string, any>> {
    const cached = await this.cacheService.getData(
      `${CHAT_WIDGET_CACHE_PREFIX}_${runId}`,
    );
    if (cached) {
      return JSON.parse(cached);
    }

    const run = await this.assertChatWidgetRun(runId);
    const appName = run.context?.appName;
    if (!appName) {
      throw new BadRequestException("Chat widget run context is invalid");
    }
    const teamConfig = await this.teamService.getConfigFromConnectorPrimaryIdentifier(
      appName,
      "Chat Widget",
      "chatBot",
    );
    return this.cacheRunContext(run, teamConfig);
  }

  async saveAgentState(runId: string, state: LlmAgentState): Promise<void> {
    await this.cacheService.setData(
      `${CHAT_WIDGET_CACHE_PREFIX}_${runId}_state`,
      JSON.stringify(state),
      3600 * 24,
    );
  }

  async loadAgentState(runId: string): Promise<LlmAgentState | undefined> {
    const cached = await this.cacheService.getData(
      `${CHAT_WIDGET_CACHE_PREFIX}_${runId}_state`,
    );
    return cached ? JSON.parse(cached) : undefined;
  }

  private async cacheRunContext(
    run: WorkflowRun,
    teamConfig: Record<string, any>,
  ): Promise<Record<string, any>> {
    const replyStep = run.workflow?.steps?.find(
      (step) => step.name === "Establish Connection",
    );
    const context = {
      runId: run.id,
      appName: run.context?.appName,
      sessionId: run.context?.sessionId,
      linkType: replyStep?.values?.linkType,
      linkAsk: replyStep?.values?.linkAsk,
      linkDestination: replyStep?.values?.linkDestination,
      link: replyStep?.values?.link,
      greetingMessage: replyStep?.values?.greetingMessage,
      teamId: teamConfig?.teamId,
      beforeYouGo: replyStep?.values?.beforeYouGo,
      llmAgent: teamConfig?.config?.llmAgent ?? {},
    };
    await this.cacheService.setData(
      `${CHAT_WIDGET_CACHE_PREFIX}_${run.id}`,
      JSON.stringify(context),
      3600 * 24,
    );
    return context;
  }

  private async assertValidSignature({
    signature,
    timestamp,
    secret,
  }: {
    signature?: string;
    timestamp?: string;
    secret: string;
  }): Promise<void> {
    if (!signature) {
      throw new UnauthorizedException("Missing chat widget signature");
    }
    if (!timestamp) {
      throw new UnauthorizedException("Missing chat widget timestamp");
    }

    const parsedTimestamp = Number(timestamp);
    const maxAgeMs = Number(
      this.config.get<string>("CHAT_WIDGET_SIGNATURE_MAX_AGE_MS") ?? 300000,
    );
    if (
      !Number.isFinite(parsedTimestamp) ||
      Math.abs(Date.now() - parsedTimestamp) > maxAgeMs
    ) {
      throw new UnauthorizedException("Expired chat widget signature");
    }

    const payload = JSON.stringify({ timestamp });
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      throw new UnauthorizedException("Invalid chat widget signature");
    }
  }

  private buildWebSocketUrl(runId: string): string {
    const configured = this.config.get<string>("CHAT_WIDGET_WEBSOCKET_URL");
    const base = configured?.trim() || this.apiUrlToWebSocketUrl();
    const url = new URL(base);
    url.searchParams.set("runId", runId);
    return url.toString();
  }

  private apiUrlToWebSocketUrl(): string {
    const apiUrl = this.config.get<string>("API_URL");
    if (!apiUrl?.trim()) {
      throw new BadRequestException("API_URL is not configured");
    }
    const url = new URL(apiUrl.replace(/\/$/, "") + CHAT_WIDGET_WS_PATH);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }
}
