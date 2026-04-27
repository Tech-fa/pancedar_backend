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

/**
 * Non-streaming single-shot completion against the same OpenAI-compatible
 * endpoint as {@link streamLLM}. Intended for fast classification / routing
 * calls (e.g. "is this a confirmation?") where we want a terse response and
 * a hard timeout rather than a live token stream.
 */
export async function completeLLM(opts: CompleteLLMOptions): Promise<string> {
  const controller = new AbortController();
  const timeout = opts.timeoutMs
    ? setTimeout(() => controller.abort(), opts.timeoutMs)
    : null;

  try {
    const response = await axios.post(
      opts.apiUrl,
      {
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0,
        max_tokens: opts.maxTokens ?? 64,
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      },
    );

    const content: unknown =
      response.data?.choices?.[0]?.message?.content ?? "";
    return String(content).trim();
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function* streamLLM(
  opts: StreamLLMOptions,
): AsyncGenerator<string, void, void> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.5,
    stream: true,
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
