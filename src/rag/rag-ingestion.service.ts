import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { ChunkSourceType, ResourceChunk } from "./resource-chunk.ts_entity";
import { ChunkerService } from "./chunker.service";
import { EmbeddingService } from "../embedding/embedding.service";

interface SourceChunk {
  sourceType: ChunkSourceType;
  sourceRef: string | null;
  content: string;
}

export interface IndexResourceParams {
  teamId: string;
  resourceId: string;
  resourceType: "category" | "resource";
  textResource: string | null;
  fileTexts: { key: string; text: string }[];
  linkTexts: { url: string; text: string }[];
}

const EMBED_BATCH_SIZE = 16;

@Injectable()
export class RagIngestionService {
  private readonly logger = new Logger(RagIngestionService.name);

  constructor(
    @InjectRepository(ResourceChunk, "psql")
    private readonly chunkRepo: Repository<ResourceChunk>,
    private readonly chunker: ChunkerService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async indexResource(params: IndexResourceParams): Promise<void> {
    const sources = this.collectSources(params);
    const pieces = this.chunkAll(sources);

    if (!pieces.length) {
      await this.removeResource(params.resourceId, params.resourceType);
      return;
    }

    const vectors = await this.embedInBatches(pieces.map((p) => p.content));
    const rows = pieces.map((p, i) =>
      this.chunkRepo.create({
        id: uuidv4(),
        teamId: params.teamId,
        resourceId: params.resourceId,
        resourceType: params.resourceType,
        sourceType: p.sourceType,
        sourceRef: p.sourceRef,
        chunkIndex: i,
        content: p.content,
        embedding: vectors[i],
      }),
    );

    await this.chunkRepo.manager.transaction(async (tx) => {
      await tx.delete(ResourceChunk, {
        resourceId: params.resourceId,
        resourceType: params.resourceType,
      });
      await tx.save(ResourceChunk, rows, { chunk: 100 });
    });

    this.logger.log(
      `Indexed ${rows.length} chunks for resource ${params.resourceId}`,
    );
  }

  async removeResource(resourceId: string,resourceType: "category" | "resource"): Promise<void> {
    await this.chunkRepo.delete({ resourceId, resourceType });
  }

  async removeResources(
    resourceId: string,
    resourceType: "category" | "resource",
  ): Promise<void> {
    await this.chunkRepo.delete({ resourceId, resourceType });
  }

  private collectSources(params: IndexResourceParams): SourceChunk[] {
    const sources: SourceChunk[] = [];
    if (params.textResource && params.textResource.trim()) {
      sources.push({
        sourceType: "text",
        sourceRef: null,
        content: params.textResource,
      });
    }
    for (const f of params.fileTexts) {
      if (f.text?.trim()) {
        sources.push({ sourceType: "file", sourceRef: f.key, content: f.text });
      }
    }
    for (const l of params.linkTexts) {
      if (l.text?.trim()) {
        sources.push({ sourceType: "link", sourceRef: l.url, content: l.text });
      }
    }
    return sources;
  }

  private chunkAll(sources: SourceChunk[]): SourceChunk[] {
    const result: SourceChunk[] = [];
    for (const s of sources) {
      const pieces = this.chunker.chunk(s.content);
      for (const piece of pieces) {
        result.push({
          sourceType: s.sourceType,
          sourceRef: s.sourceRef,
          content: piece,
        });
      }
    }
    return result;
  }

  private async embedInBatches(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      const out = await this.embeddingService.embedBatch(batch);
      vectors.push(...out);
    }
    return vectors;
  }
}
