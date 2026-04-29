import { Logger } from "@nestjs/common";
import axios from "axios";
import type { Readable } from "stream";

/**
 * OpenAI-compatible streaming chat completion.
 *
 * Works with DeepSeek (same SSE format) — configured via LLM_API_URL /
 * LLM_API_KEY / LLM_MODEL in the existing .env.
 *
 * Yields assistant text tokens as they arrive. Honors the provided
 * AbortSignal so a barge-in can cancel in-flight generation.
 */

const logger = new Logger("LLMStream");

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type StreamLLMOptions = {
  apiUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

export type CompleteLLMOptions = {
  apiUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export async function* streamLLM(
  opts: StreamLLMOptions,
): AsyncGenerator<string, void, void> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: 0,
    stream: true,
    reasoning: {
      enabled: false,
    },
  };
  if (typeof opts.maxTokens === "number") body.max_tokens = opts.maxTokens;

  const response = await axios.post(opts.apiUrl, body, {
    responseType: "stream",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: opts.signal,
  });

  const stream = response.data as Readable;
  let buffer = "";

  try {
    for await (const chunk of stream) {
      buffer += (chunk as Buffer).toString("utf8");

      // SSE frames are separated by blank lines.
      let idx = buffer.indexOf("\n\n");
      while (idx !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        idx = buffer.indexOf("\n\n");

        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const token = json.choices?.[0]?.delta?.content;
            if (token) yield token;
          } catch (e) {
            logger.debug(
              `Skipping malformed SSE payload: ${(e as Error).message}`,
            );
          }
        }
      }
    }
  } catch (err) {
    throw err;
  }
}
/**
 * Sends a user prompt to the configured chat completion API and returns the assistant text.
 * Pass `teamId` (and optionally `workflowRunId`) in options to have the token usage and
 * cost automatically persisted to the cost module.
 */
export async function completeUserPrompt(
  prompt: string,
  options?: {
    maxTokens?: number;
    /** Required to persist cost records */
    teamId?: string;
    workflowRunId?: string | null;
  },
): Promise<string> {
  const url = process.env.LLM_API_URL ?? "";
  const apiKey = process.env.LLM_API_KEY ?? "";
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";

  if (!url?.trim()) {
    throw new Error("LLM_API_URL is not configured");
  }
  if (!apiKey?.trim()) {
    throw new Error("LLM_API_KEY is not configured");
  }

  const maxTokens = options?.maxTokens ?? 1024;

  try {
    const { data } = await axios.post<unknown>(
      url,
      {
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 120_000,
      },
    );

    const text = this.extractLlmAssistantText(data);

    return text;
  } catch (error) {
    this.logger.error("Error calling LLM API:", error);
    throw error;
  }
}

/** Supports OpenAI-style chat completions and common proxy shapes. */
export function extractLlmAssistantText(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }
  const d = data as Record<string, unknown>;

  const choices = d.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const c0 = choices[0] as Record<string, unknown>;
    const msg = c0.message;
    if (msg && typeof msg === "object") {
      const content = (msg as Record<string, unknown>).content;
      if (typeof content === "string") {
        return content;
      }
    }
    if (typeof c0.text === "string") {
      return c0.text;
    }
  }

  const content = d.content;
  if (Array.isArray(content) && content[0] && typeof content[0] === "object") {
    const b0 = content[0] as Record<string, unknown>;
    if (typeof b0.text === "string") {
      return b0.text;
    }
  }

  if (typeof d.text === "string") {
    return d.text;
  }
  if (typeof d.response === "string") {
    return d.response;
  }
  return "";
}
