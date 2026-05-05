import { Inject, Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from "@nestjs/websockets";
import type { IncomingMessage } from "http";
import { LlmAgent } from "src/llm-integration/llm-agent";
import { BaseLlmAgent } from "src/llm-integration/llm-agent-base";
import { QueuePublisher } from "src/queue/queue.publisher";
import { RagRetrievalService } from "src/rag/rag-retrieval.service";
import { SERVICE_MAP } from "src/service-mapping/service.map";
import { Public } from "src/util/constants";
import type { RawData, WebSocket } from "ws";
import { ChatMessageEntity, ChatMessageSentBy } from "./chat-message.entity";
import { CHAT_WIDGET_WS_PATH, ChatWidgetService } from "./chat-widget.service";
import { Events } from "src/queue/queue-constants";

type ChatWidgetWs = WebSocket & {
  agent?: BaseLlmAgent;
  runId?: string | null;
};

@WebSocketGateway({
  path: CHAT_WIDGET_WS_PATH,
  transports: ["websocket"],
})
@Public()
export class ChatWidgetGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatWidgetGateway.name);

  constructor(
    private readonly chatWidgetService: ChatWidgetService,
    private readonly ragRetrievalService: RagRetrievalService,
    private readonly queuePublisher: QueuePublisher,
    @Inject(SERVICE_MAP)
    private readonly serviceMap: Record<
      string,
      { [key: string]: (...args: any[]) => Promise<any> }
    >,
  ) {}

  async handleConnection(
    client: ChatWidgetWs,
    request: IncomingMessage,
  ): Promise<void> {
    const runId = this.parseRunIdFromUrl(request.url);
    try {
      await this.chatWidgetService.assertChatWidgetRun(runId);
      const context = await this.chatWidgetService.loadAgentContext(runId);
      const initialState = await this.chatWidgetService.loadAgentState(runId);
      client.agent = new LlmAgent(
        this.ragRetrievalService,
        this.queuePublisher,
        this.serviceMap,
        {
          source: runId,
          mission: context?.assistantMission,
          availableActions: context?.allowedActions,
          initialState,
          llmConfig: {
            apiUrl: context?.llmAgent?.apiUrl,
            apiKey: context?.llmAgent?.apiKey,
            model: context?.llmAgent?.model,
          },
          onStateChange: (state) =>
            this.chatWidgetService.saveAgentState(runId, state),
          skipPartialToken: true,
        },
      );
      client.runId = runId;
      client.send(JSON.stringify({ type: "ready", runId }));
      client.on("message", (data: RawData) => this.onMessage(client, data));
    } catch (error) {
      this.logger.warn(`Rejected chat widget socket: ${error.message}`);
      client.send(
        JSON.stringify({
          type: "error",
          message: error.message ?? "Invalid chat widget connection",
        }),
      );
      client.close();
    }
  }

  async handleDisconnect(client: ChatWidgetWs): Promise<void> {
    if (client.agent?.currentAbort) {
      client.agent.currentAbort.abort();
    }
    await this.queuePublisher.publish(Events.COMPLETE_RUN, {
      runId: client.runId,
      completedView: { subject: "chat_messages", id: client.runId },
    });
  }

  private async onMessage(client: ChatWidgetWs, data: RawData): Promise<void> {
    if (!client.agent || !client.runId) {
      client.close();
      return;
    }

    let message: { message?: string };
    try {
      message = JSON.parse(data.toString());
    } catch {
      this.sendError(client, "Invalid JSON message");
      return;
    }

    if (message.message) {
      client.agent.currentAbort?.abort();
    }

    const incomingText = String(message.message ?? "").trim();
    if (!incomingText) {
      this.sendError(client, "Message text is required");
      return;
    }

    await this.chatWidgetService.saveMessage({
      runId: client.runId,
      message: incomingText,
      sentBy: ChatMessageSentBy.USER,
    });

    client.agent
      .handleTurn(
        {
          sendPartialToken: (token) => {
            // client.send(JSON.stringify({ type: 'assistant_delta', token }));
          },
          sendFullToken: (token) => {
            if (token.trim() === "") {
              return;
            }
            void this.saveAssistantMessage(client, token);
            client.send(JSON.stringify({ type: "assistant", message: token }));
          },
          sendEmptyToken: () => {
            // client.send(JSON.stringify({ type: "assistant" }));
          },
          endConversation: () => {
            // client.send(JSON.stringify({ type: "assistant" }));
            client.close();
          },
        },
        incomingText,
      )
      .catch((error) => {
        this.logger.error(`Chat widget turn failed: ${error.message}`);
        this.sendError(client, "Failed to process message");
      });
  }

  private async saveAssistantMessage(
    client: ChatWidgetWs,
    token: string,
  ): Promise<void> {
    await this.chatWidgetService.saveMessage({
      runId: client.runId,
      message: token,
      sentBy: ChatMessageSentBy.AI,
    });
  }

  private sendError(client: ChatWidgetWs, message: string): void {
    client.send(JSON.stringify({ type: "error", message }));
  }

  private parseRunIdFromUrl(url: string | undefined): string | null {
    if (!url) return null;
    try {
      return new URL(url, "http://localhost").searchParams.get("runId");
    } catch {
      return null;
    }
  }
}
