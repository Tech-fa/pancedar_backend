import { Injectable, Logger } from "@nestjs/common";
import { completeUserPrompt } from "src/llm-integration/llm-stream";
import { Workflow } from "../workflow.entity";

export const CARLETON_PARKING_WORKFLOW_TYPE = "carleton-parking";
export const TELEGRAM_CAR_AGENT_CONNECTOR_TYPE = "Telegram Car Agent";

export type ParkingExtractionResult = {
  address: string | null;
  unitNumber: string | null;
  licensePlate: string | null;
  numberOfNights: number | null;
  messageToUser: string | null;
};

@Injectable()
export class CarletonParkingWorkflowService {
  private readonly logger = new Logger(CarletonParkingWorkflowService.name);

  getRegisterCarStepValues(workflow: Workflow): Record<string, unknown> | null {
    const step = workflow.steps?.find((s) => s.name === "register-car");
    if (!step?.values) {
      return null;
    }
    return step.values as Record<string, unknown>;
  }

  async extractParkingDetailsFromMessage(
    userMessage: string,
    registerCarConfig: Record<string, unknown>,
    existingInformation: Record<string, unknown>,
    teamConfig: { [key: string]: any },
  ): Promise<ParkingExtractionResult> {
    const apiUrl = teamConfig.apiUrl;
    const apiKey = teamConfig.apiKey;
    const model = teamConfig.model;
    if (!apiUrl?.trim() || !apiKey?.trim() || !model?.trim()) {
      this.logger.error("Team LLM agent (apiUrl, apiKey, model) is not configured");
      return {
        address: null,
        unitNumber: null,
        licensePlate: null,
        numberOfNights: null,
        messageToUser:
          "Parking assistant LLM is not configured for your team. Please contact support.",
      };
    }

    const systemPrompt = `You help parse Telegram messages for Carleton parking registration.

The workflow already has this "register-car" configuration (cars and locations the user set up). Use it to resolve nicknames (e.g. car name → license plate, location name → address and unit).

Configuration JSON:
${JSON.stringify(registerCarConfig, null, 2)}

Existing information JSON:
${JSON.stringify(existingInformation ?? {}, null, 2)}

From the user's latest message, extract:
- address (street address as a string, or null if unknown)
- unitNumber (string, or null if unknown)
- licensePlate (string, or null if unknown)
- numberOfNights (positive integer count of nights, or null if unknown)

Rules:
- Return ONLY a single JSON object. No markdown fences, no prose before or after.
- Use null for any field you cannot infer from the message and configuration.
- If any of the four fields above is null or uncertain, set "messageToUser" to a short, polite question asking only for what is still missing. Ask one combined question when multiple items are missing.
- If all four fields are confidently filled, set "messageToUser" to null.

Exact JSON shape:
{"address": string|null,"unitNumber": string|null,"licensePlate": string|null,"numberOfNights": number|null,"messageToUser": string|null}`;

    const raw = await completeUserPrompt({
      apiUrl,
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage.trim() },
      ],
    });

    return this.parseParkingLlmJson(raw);
  }

  private parseParkingLlmJson(raw: string): ParkingExtractionResult {
    const empty: ParkingExtractionResult = {
      address: null,
      unitNumber: null,
      licensePlate: null,
      numberOfNights: null,
      messageToUser: null,
    };
    try {
      let cleaned = raw.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.slice(7);
      }
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith("```")) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) {
        throw new Error("No JSON object in model output");
      }
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<
        string,
        unknown
      >;

      const numRaw = parsed.numberOfNights;
      let numberOfNights: number | null = null;
      if (typeof numRaw === "number" && Number.isFinite(numRaw) && numRaw > 0) {
        numberOfNights = Math.floor(numRaw);
      } else if (typeof numRaw === "string" && numRaw.trim()) {
        const n = Number.parseInt(numRaw, 10);
        if (Number.isFinite(n) && n > 0) {
          numberOfNights = n;
        }
      }

      return {
        address: typeof parsed.address === "string" ? parsed.address : null,
        unitNumber:
          typeof parsed.unitNumber === "string" ? parsed.unitNumber : null,
        licensePlate:
          typeof parsed.licensePlate === "string" ? parsed.licensePlate : null,
        numberOfNights,
        messageToUser:
          typeof parsed.messageToUser === "string"
            ? parsed.messageToUser
            : null,
      };
    } catch (e) {
      this.logger.warn(
        `Failed to parse parking LLM JSON: ${(e as Error).message}`,
      );
      return {
        ...empty,
        messageToUser:
          "I could not read that. Please send your address, unit number, license plate, and how many nights.",
      };
    }
  }
}
