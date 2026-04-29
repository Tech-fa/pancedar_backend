import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import twilio, { Twilio } from "twilio";
import { WorkflowService } from "src/workflows/workflow.service";
import * as tClient from "twilio";
import { CacheService } from "src/cache/cache.service";

export const TWILIO_MEDIA_PATH = "/connector/twilio/media";
export const TWILIO_CACHE_PREFIX = "twilio_voice";
@Injectable()
export class TwilioVoiceService {
  private readonly logger = new Logger(TwilioVoiceService.name);
  private readonly client: Twilio;
  constructor(
    private readonly config: ConfigService,
    private readonly workflowService: WorkflowService,
    private readonly cacheService: CacheService,
  ) {
    this.client = tClient(
      this.config.get("TWILIO_ACCOUNT_SID"),
      this.config.get("TWILIO_AUTH_TOKEN"),
    );
  }

  isVoiceEnabled(): boolean {
    const v = this.config.get<string>("TWILIO_ENABLED");
    return v === "true" || v === "1";
  }

  /** Base URL for webhooks (https), same host Twilio will call for TwiML. */
  private apiBaseUrl(): string {
    const url = this.config.get<string>("API_URL");
    if (!url?.trim()) {
      throw new Error("API_URL is not configured");
    }
    return url.replace(/\/$/, "");
  }

  /** Full URL Twilio posted to (must match X-Twilio-Signature validation). */
  voiceWebhookUrl(req: Request): string {
    const host = req.get("host");
    if (!host) {
      return `${this.apiBaseUrl()}/connector/twilio/voice/incoming`;
    }
    const xfProto = req.get("x-forwarded-proto");
    const proto = (xfProto || req.protocol || "https").split(",")[0].trim();
    const path = (req.originalUrl || "/connector/twilio/voice/incoming").split(
      "?",
    )[0];
    return `${proto}://${host}${path}`;
  }

  assertValidTwilioRequest(req: Request, body: Record<string, string>): void {
    const validate = this.config.get<string>("TWILIO_VALIDATE_SIGNATURE");
    if (validate !== "true" && validate !== "1") {
      return;
    }
    const token = this.config.get<string>("TWILIO_AUTH_TOKEN");
    if (!token) {
      this.logger.warn(
        "TWILIO_VALIDATE_SIGNATURE is on but TWILIO_AUTH_TOKEN is missing",
      );
      return;
    }
    const signature = req.get("x-twilio-signature");
    if (!signature) {
      throw new UnauthorizedException("Missing Twilio signature");
    }
    const url = this.voiceWebhookUrl(req);
    const ok = twilio.validateRequest(token, signature, url, body);
    if (!ok) {
      throw new UnauthorizedException("Invalid Twilio signature");
    }
  }

  /**
   * @param calledE164 Twilio `To` — the number that was dialed (your inbound number).
   *
   * Uses bidirectional <Connect><Stream> so we own STT + TTS ourselves.
   * Twilio will open a WebSocket to `streamUrl` and send base64 μ-law 8k
   * audio; we send audio back on the same WebSocket.
   */
  async buildIncomingTwiML(calledE164?: string, fromNumber?: string): Promise<string> {
    const [streamUrl, greetingMessage] = await this.buildMediaStreamUrl(
      calledE164,
      fromNumber,
    );
    return `<?xml version="1.0" encoding="UTF-8"?>
            <Response>
            <Connect>
              <ConversationRelay url="${this.escapeXml(
                streamUrl,
              )}" welcomeGreeting="${greetingMessage}" ttsProvider="ElevenLabs" voice="s3TPKV1kjDlVtZbl4Ksh-turbo_v2_5"/>
            </Connect>
          </Response>`;
  }

  async doCall(calledE164?: string): Promise<void> {
    const call = await this.client.calls.create({
      to: calledE164,
      from: this.config.get("TWILIO_PHONE_NUMBER"),
      twiml: await this.buildIncomingTwiML(calledE164),
    });
  }

  /**
   * Base WebSocket URL from TWILIO_MEDIA_WEBSOCKET_URL, with `to` query set to the dialed number.
   */
  async buildMediaStreamUrl(calledE164?: string, fromNumber?: string): Promise<[string, string]> {
    const base = this.config.get<string>("TWILIO_MEDIA_WEBSOCKET_URL");
    if (!base?.trim()) {
      throw new Error("TWILIO_MEDIA_WEBSOCKET_URL is not configured");
    }
    const u = new URL(base.trim());
    let greetingMessage = "Hello, how can I help you today?";
    if (calledE164?.trim()) {
      const workflowRun = await this.workflowService.createWorkflowRunFromPrimaryIdentifier(
        {
          primaryIdentifier: calledE164.trim(),
          workflowName: "voice-assistant",
          connectorTypeId: "twilio",
          displayContext: {
            from: fromNumber,
          },
        },
      );
      this.cacheService.setData(`${TWILIO_CACHE_PREFIX}_${workflowRun.id}`, JSON.stringify(workflowRun.context), 3600 * 24);
      u.searchParams.set("runId", workflowRun.id);
      greetingMessage = workflowRun.context.greetingMessage;
    }
    return [u.toString(), greetingMessage];
  }

  buildDisabledTwiML(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Reject reason="busy" />
</Response>`;
  }

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
