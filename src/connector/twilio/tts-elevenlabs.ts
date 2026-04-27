import { Logger } from "@nestjs/common";
import * as WebSocket from "ws";

/**
 * Streaming TTS over ElevenLabs "stream-input" WebSocket.
 *
 * We request `output_format=ulaw_8000` so the audio is already in Twilio's
 * native format — no transcoding, just forward the bytes.
 *
 * Usage:
 *   const tts = createElevenLabsSession({ apiKey, voiceId, onAudio });
 *   tts.sendText("Hello ");
 *   tts.sendText("world.");
 *   tts.flush();  // optional: force generation of whatever has been buffered
 *   tts.end();    // signals end-of-stream
 */

export type ElevenLabsOptions = {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  /**
   * Character-count thresholds that control server-side buffering. The
   * Nth entry says "wait until you've received at least N chars before
   * synthesizing the Nth chunk." Smaller first value = lower TTFB but
   * less prosody context; larger later values = smoother mid-sentence
   * transitions. Only applies when auto_mode is OFF.
   */
  chunkLengthSchedule?: number[];
  onOpen?: () => void;
  /** base64 audio chunks from ElevenLabs (ulaw 8k), exactly as received. */
  onAudio?: (audioBase64: string) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
};

export type ElevenLabsSession = {
  sendText: (text: string) => void;
  flush: () => void;
  end: () => void;
  close: () => void;
};

type ElevenLabsServerMessage = {
  audio?: string | null;
  isFinal?: boolean | null;
  normalizedAlignment?: unknown;
  alignment?: unknown;
  error?: string;
  message?: string;
};

export function createElevenLabsSession(
  opts: ElevenLabsOptions,
): ElevenLabsSession {
  const logger = new Logger("ElevenLabsTTS");

  const modelId = opts.modelId ?? "eleven_multilingual_v2";
  // NOTE: auto_mode is intentionally OFF. It disables chunk_length_schedule
  // and try_trigger_generation, which means every sendText frame would be
  // synthesized in isolation — fine for sentence-sized chunks, but when the
  // caller streams word-by-word the model has no context and prosody breaks.
  const url =
    `wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
      opts.voiceId,
    )}` +
    `/stream-input?model_id=${encodeURIComponent(modelId)}` +
    `&output_format=ulaw_8000` +
    `&inactivity_timeout=60`;

  const ws = new WebSocket(url);

  let opened = false;
  let ended = false;
  const pending: string[] = [];

  ws.on("open", () => {
    opened = true;
    // BOS frame required by ElevenLabs. `text` must contain at least one space.
    ws.send(
      JSON.stringify({
        text: " ",
        voice_settings: {
          stability: opts.stability ?? 0.5,
          similarity_boost: opts.similarityBoost ?? 0.8,
        },
        generation_config: {
          chunk_length_schedule: opts.chunkLengthSchedule ?? [50, 90, 120, 150],
        },
        xi_api_key: opts.apiKey,
      }),
    );
    for (const t of pending) {
      ws.send(JSON.stringify({ text: t, try_trigger_generation: false }));
    }
    pending.length = 0;
    opts.onOpen?.();
  });

  ws.on("message", (raw: WebSocket.RawData) => {
    let msg: ElevenLabsServerMessage;
    try {
      msg = JSON.parse(raw.toString()) as ElevenLabsServerMessage;
    } catch {
      return;
    }
    if (msg.error) {
      logger.error(`ElevenLabs error: ${msg.error} ${msg.message ?? ""}`);
      opts.onError?.(new Error(msg.error));
      return;
    }
    if (msg.audio) {
      opts.onAudio?.(msg.audio);
    }
    if (msg.isFinal) {
      opts.onDone?.();
    }
  });

  ws.on("error", (err: Error) => {
    logger.error(`ElevenLabs socket error: ${err.message}`);
    opts.onError?.(err);
  });

  ws.on("close", () => {
    opts.onClose?.();
  });

  const send = (frame: Record<string, unknown>): void => {
    if (ended) return;
    if (ws.readyState === WebSocket.OPEN && opened) {
      ws.send(JSON.stringify(frame));
    }
  };

  return {
    sendText(text: string): void {
      if (!text) return;
      // ElevenLabs uses whitespace as the token/word boundary marker.
      // Guaranteeing a trailing space prevents the next frame's first
      // characters from being glued onto this word.
      const framed = text.endsWith(" ") ? text : `${text} `;
      if (!opened) {
        pending.push(framed);
        return;
      }
      send({ text: framed, try_trigger_generation: false });
    },
    flush(): void {
      send({ text: "", flush: true });
    },
    end(): void {
      if (ended) return;
      ended = true;
      if (ws.readyState === WebSocket.OPEN) {
        // Empty-text frame signals end-of-stream to ElevenLabs.
        ws.send(JSON.stringify({ text: "" }));
      }
    },
    close(): void {
      ended = true;
      console.log("closing elevenlabs session", ws.readyState);
      try {
        ws.send(JSON.stringify({ text: "" }));
        ws.close();
      } catch {
        // ignore
      }
    },
  };
}
