import { Logger } from "@nestjs/common";
import * as  WebSocket from "ws";

/**
 * Streaming STT over Deepgram's realtime WebSocket.
 *
 * Audio format in: μ-law, 8 kHz, mono (same as what Twilio <Stream> delivers,
 * so no transcoding needed).
 *
 * Emits:
 *  - onPartial(text)          : interim transcripts as words arrive
 *  - onFinal(text)            : is_final=true segment (one chunk of a sentence)
 *  - onUtteranceEnd(text)     : user finished speaking (use this to trigger LLM)
 *  - onSpeechStarted()        : user started speaking (use for barge-in)
 */

export type DeepgramOptions = {
  apiKey: string;
  model?: string;
  endpointingMs?: number;
  utteranceEndMs?: number;
  onOpen?: () => void;
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onUtteranceEnd?: (fullUtterance: string) => void;
  onSpeechStarted?: () => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
};

export type DeepgramSession = {
  sendAudio: (mulawBytes: Buffer) => void;
  close: () => void;
};

type DeepgramResultsMessage = {
  type: "Results";
  channel: { alternatives: Array<{ transcript: string }> };
  is_final: boolean;
  speech_final: boolean;
};

type DeepgramMessage =
  | DeepgramResultsMessage
  | { type: "SpeechStarted" }
  | { type: "UtteranceEnd" }
  | { type: "Metadata" }
  | { type: string };

export function createDeepgramSession(opts: DeepgramOptions): DeepgramSession {
  const logger = new Logger("DeepgramSTT");

  const params = new URLSearchParams({
    encoding: "mulaw",
    sample_rate: "8000",
    channels: "1",
    model: opts.model ?? "nova-3-general",
    interim_results: "true",
    smart_format: "true",
    punctuate: "true",
    vad_events: "true",
    endpointing: String(opts.endpointingMs ?? 300),
    utterance_end_ms: String(opts.utteranceEndMs ?? 1000),
  });

  const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
  const ws = new WebSocket(url, {
    headers: { Authorization: `Token ${opts.apiKey}` },
  });

  // Accumulates is_final fragments between UtteranceEnd events.
  const finalFragments: string[] = [];
  let queued: Buffer[] = [];
  let opened = false;

  ws.on("open", () => {
    opened = true;
    for (const buf of queued) ws.send(buf);
    queued = [];
    opts.onOpen?.();
  });

  ws.on("message", (raw: WebSocket.RawData) => {
    let msg: DeepgramMessage;
    try {
      msg = JSON.parse(raw.toString()) as DeepgramMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case "Results": {
        const results = msg as DeepgramResultsMessage;
        const alt = results.channel?.alternatives?.[0];
        const text = alt?.transcript?.trim();
        if (!text) return;
        if (results.is_final) {
          finalFragments.push(text);
          opts.onFinal?.(text);
        } else {
          opts.onPartial?.(text);
        }
        break;
      }
      case "SpeechStarted":
        opts.onSpeechStarted?.();
        break;
      case "UtteranceEnd": {
        const full = finalFragments.join(" ").trim();
        finalFragments.length = 0;
        if (full) opts.onUtteranceEnd?.(full);
        break;
      }
      case "Metadata":
        break;
      default:
        break;
    }
  });

  ws.on("error", (err: Error) => {
    logger.error(`Deepgram socket error: ${err.message}`);
    opts.onError?.(err);
  });

  ws.on("close", () => {
    opts.onClose?.();
  });

  return {
    sendAudio(mulawBytes: Buffer): void {
      if (!opened) {
        queued.push(mulawBytes);
        return;
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(mulawBytes);
      }
    },
    close(): void {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "CloseStream" }));
          ws.close();
        }
      } catch {
        // ignore
      }
    },
  };
}
