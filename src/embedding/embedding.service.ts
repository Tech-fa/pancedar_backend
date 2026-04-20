import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

type FeatureExtractionPipeline = (
  text: string | string[],
  options: { pooling: 'mean' | 'cls'; normalize: boolean },
) => Promise<{ data: Float32Array | number[] | number[][]; dims: number[] }>;

export const EMBEDDING_DIM = 384;
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

  async onModuleInit(): Promise<void> {
    void this.getPipeline().catch((err) =>
      this.logger.error('Failed to preload embedding model', err),
    );
  }

  async embed(text: string): Promise<number[]> {
    const vectors = await this.embedBatch([text]);
    return vectors[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const pipeline = await this.getPipeline();
    const output = await pipeline(texts, { pooling: 'mean', normalize: true });
    return this.splitIntoVectors(output.data, texts.length);
  }

  private getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = this.loadPipeline();
    }
    return this.pipelinePromise;
  }

  private async loadPipeline(): Promise<FeatureExtractionPipeline> {
    this.logger.log(`Loading embedding model: ${MODEL_ID}`);
    const { pipeline } = await import('@xenova/transformers');
    const p = (await pipeline(
      'feature-extraction',
      MODEL_ID,
    )) as unknown as FeatureExtractionPipeline;
    this.logger.log(`Embedding model ready (${EMBEDDING_DIM} dims)`);
    return p;
  }

  private splitIntoVectors(
    data: Float32Array | number[] | number[][],
    count: number,
  ): number[][] {
    if (Array.isArray(data) && Array.isArray((data as number[][])[0])) {
      return (data as number[][]).map((row) => Array.from(row));
    }
    const flat = Array.from(data as Float32Array | number[]);
    if (flat.length !== count * EMBEDDING_DIM) {
      throw new Error(
        `Unexpected embedding output shape: ${flat.length} values for ${count} inputs`,
      );
    }
    const result: number[][] = [];
    for (let i = 0; i < count; i++) {
      result.push(flat.slice(i * EMBEDDING_DIM, (i + 1) * EMBEDDING_DIM));
    }
    return result;
  }
}
