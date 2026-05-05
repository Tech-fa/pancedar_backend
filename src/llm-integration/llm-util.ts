export type SpokenExtractionState = {
  valueStart: number | null;
  cursor: number;
  spokenDone: boolean;
  firstSpeechAt: number | null;
  emitted: string;
};

export function extractSpoken(
  raw: string,
  state: SpokenExtractionState,
  signal: AbortSignal,
  onSpeechChunk: (chunk: string) => void,
  onFirstSpeechChunk?: () => void,
): void {
  if (state.spokenDone) return;

  if (state.valueStart === null) {
    const SPOKEN_KEY = '"spokenMessage"';
    const keyIdx = raw.indexOf(SPOKEN_KEY);
    if (keyIdx === -1) return;
    const after = raw.slice(keyIdx + SPOKEN_KEY.length);
    const m = after.match(/^\s*:\s*"/);
    if (!m) return;
    state.valueStart = keyIdx + SPOKEN_KEY.length + m[0].length;
    state.cursor = state.valueStart;
  }

  let i = state.cursor;
  let chunk = "";
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "\\") {
      if (i + 1 >= raw.length) break;
      const next = raw[i + 1];
      const map: Record<string, string> = {
        n: "\n",
        t: "\t",
        r: "\r",
        '"': '"',
        "\\": "\\",
        "/": "/",
        b: "\b",
        f: "\f",
      };
      chunk += map[next] ?? next;
      i += 2;
    } else if (ch === '"') {
      state.spokenDone = true;
      i += 1;
      break;
    } else {
      chunk += ch;
      i += 1;
    }
  }

  state.cursor = i;
  if (!chunk) return;

  if (state.firstSpeechAt === null) {
    state.firstSpeechAt = Date.now();
    onFirstSpeechChunk?.();
  }

  state.emitted += chunk;
  if (signal.aborted) return;
  onSpeechChunk(chunk);
}
