import { Injectable } from '@nestjs/common';

/** ~4 characters per token heuristic (English mean for BPE-like tokenizers). */
const CHARS_PER_TOKEN = 4;
const DEFAULT_TARGET_TOKENS = 500;
const DEFAULT_OVERLAP_TOKENS = 50;

export interface ChunkOptions {
  targetTokens?: number;
  overlapTokens?: number;
}

@Injectable()
export class ChunkerService {
  /**
   * Sentence-aware chunker. Splits on sentence boundaries, then greedily
   * packs sentences into chunks near the target token size. Consecutive
   * chunks share `overlapTokens` worth of trailing characters from the
   * previous chunk to preserve context across boundaries.
   */
  chunk(text: string, options: ChunkOptions = {}): string[] {
    const targetChars =
      (options.targetTokens ?? DEFAULT_TARGET_TOKENS) * CHARS_PER_TOKEN;
    const overlapChars =
      (options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS) * CHARS_PER_TOKEN;

    const normalised = text.replace(/\s+/g, ' ').trim();
    if (!normalised) return [];
    if (normalised.length <= targetChars) return [normalised];

    const sentences = this.splitSentences(normalised);
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if (sentence.length > targetChars) {
        if (current.trim()) chunks.push(current.trim());
        chunks.push(...this.hardSplit(sentence, targetChars));
        current = '';
        continue;
      }
      if (current.length + sentence.length + 1 > targetChars) {
        chunks.push(current.trim());
        current = this.carryOverlap(current, overlapChars) + sentence + ' ';
      } else {
        current += sentence + ' ';
      }
    }

    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  private splitSentences(text: string): string[] {
    return text
      .split(/(?<=[.!?])\s+(?=[A-Z(\["'])/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private hardSplit(text: string, maxChars: number): string[] {
    const result: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) {
      result.push(text.slice(i, i + maxChars).trim());
    }
    return result;
  }

  private carryOverlap(previous: string, overlapChars: number): string {
    if (overlapChars <= 0 || !previous) return '';
    const tail = previous.slice(-overlapChars);
    const firstSpace = tail.indexOf(' ');
    const clean = firstSpace > 0 ? tail.slice(firstSpace + 1) : tail;
    return clean.trim() ? clean.trim() + ' ' : '';
  }
}
