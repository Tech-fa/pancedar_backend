import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from "@nestjs/websockets";
import type { IncomingMessage } from "http";
import { Public } from "../../util/constants";
import type { RawData, WebSocket } from "ws";
import { RagRetrievalService } from "../../rag/rag-retrieval.service";
import { LlmAgent } from "src/llm-integration/llm-agent";

type TwilioWs = WebSocket;

/**
 * Receives Twilio Media Streams frames (base64 μ-law 8 kHz) and delegates each
 * call to a CallSession that runs:  Deepgram STT -> DeepSeek LLM -> ElevenLabs TTS.
 * @see https://www.twilio.com/docs/voice/media-streams/websocket-messages
 */
@WebSocketGateway({
  path: "/connector/twilio/media",
  transports: ["websocket"],
})
@Public()
export class TwilioMediaGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TwilioMediaGateway.name);

  constructor(
    private readonly config: ConfigService,
    private readonly ragRetrievalService: RagRetrievalService,
  ) {}

  handleConnection(client: TwilioWs, request: IncomingMessage): void {
    const llmAgent = new LlmAgent(this.config, this.ragRetrievalService);
    client["agent"] = llmAgent;
    client.on("message", (data: RawData) =>
      this.onMessage(client as WebSocket & { agent: LlmAgent }, data),
    );
  }

  handleDisconnect(): void {}

  private parseRunIdFromUrl(url: string | undefined): string | null {
    if (!url) return null;
    try {
      return new URL(url, "http://localhost").searchParams.get("runId");
    } catch {
      return null;
    }
  }

  private async onMessage(
    client: WebSocket & { agent: LlmAgent },
    data: RawData,
  ): Promise<void> {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      this.logger.warn("Non-JSON WebSocket frame ignored");
      return;
    }

    switch (msg.type) {
      case "setup":
        break;

      case "prompt": {
        const incomingText = String(msg.voicePrompt ?? "");
        console.log("incomingText", incomingText);
        client.agent
          .handleTurn(
            {
              sendPartialToken: this.partialSendToken.bind(this, client),
              sendFullToken: this.fullSendToken.bind(this, client),
              sendEmptyToken: this.emptySendToken.bind(this, client),
              endConversation: () => {
                this.emptySendToken(client);
                client.close();
              },
            },
            incomingText,
          )
          .catch((err) => {
            this.logger.error(`Turn failed: ${(err as Error).message}`);
          });
        break;
      }

      case "interrupt":
        // Twilio ConversationRelay tells us the caller started speaking over
        // the bot. The incoming audio will be transcribed and arrive as a
        // "prompt" message shortly; the classifier there will decide whether
        // it is a confirmation or a real barge-in. We do not abort here
        // because doing so would kill the in-flight response before we know
        // whether to keep it.
        this.logger.debug("interrupt received (awaiting transcribed prompt)");
        client.agent.currentAbort?.abort();

        client.send(JSON.stringify({ type: "text", token: "", last: true }));
        break;

      default:
        console.warn("Unknown message type received:", msg.type);
        break;
    }
  }

  private emptySendToken(client: WebSocket): void {
    client.send(JSON.stringify({ type: "text", token: "", last: true }));
  }
  private fullSendToken(client: WebSocket, token: string): void {
    client.send(JSON.stringify({ type: "text", token, last: true }));
  }
  private partialSendToken(client: WebSocket, token: string): void {
    client.send(JSON.stringify({ type: "text", token, last: false }));
  }
}
