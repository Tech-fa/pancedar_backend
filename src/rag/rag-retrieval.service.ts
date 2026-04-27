import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChunkSourceType, ResourceChunk } from "./resource-chunk.ts_entity";
import { EmbeddingService } from "../embedding/embedding.service";
import { LlmService } from "../llm-integration/llm.service";

export interface RetrievedChunk {
  id: string;
  resourceId: string;
  sourceType: ChunkSourceType;
  sourceRef: string | null;
  content: string;
}

const CANDIDATE_LIMIT = 20;
const RRF_K = 60;
const RERANK_SNIPPET_CHARS = 500;

@Injectable()
export class RagRetrievalService {
  private readonly logger = new Logger(RagRetrievalService.name);

  constructor(
    @InjectRepository(ResourceChunk, "psql")
    private readonly chunkRepo: Repository<ResourceChunk>,
    private readonly embeddingService: EmbeddingService,
    private readonly llmService: LlmService,
  ) {}

  /**
   * Hybrid retrieval for a single category. Runs a vector similarity search
   * (cosine) and a BM25-style full-text search in parallel, fuses them with
   * Reciprocal Rank Fusion, then asks the LLM to rerank the top candidates.
   */
  async retrieve(
    resourceId: string,
    resourceType: "category" | "resource",
    teamId: string,
    query: string,
    topK = 5,
    skipResourceId = false,
  ): Promise<RetrievedChunk[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const [vectorHits, bm25Hits] = await Promise.all([
      this.vectorSearch(
        resourceId,
        resourceType,
        teamId,
        cleanQuery,
        skipResourceId,
      ),
      this.bm25Search(
        resourceId,
        resourceType,
        teamId,
        cleanQuery,
        skipResourceId,
      ),
    ]);

    const fused = this.rrfFuse(vectorHits, bm25Hits);
    if (!fused.length) return [];

    const candidates = fused.slice(0, CANDIDATE_LIMIT);
    const reranked = await this.llmRerank(cleanQuery, candidates, topK, teamId);
    return reranked.length ? reranked : candidates.slice(0, topK);
  }

  private async vectorSearch(
    resourceId: string,
    resourceType: "category" | "resource",
    teamId: string,
    query: string,
    skipResourceId: boolean,
  ): Promise<RetrievedChunk[]> {
    const [embedding] = await this.embeddingService.embedBatch([query]);
    const vectorLiteral = `[${embedding.map((n) => n.toFixed(7)).join(",")}]`;

    const resourceClause = skipResourceId
      ? ""
      : `resource_id = '${resourceId}' AND `;
    const rows = await this.chunkRepo.query(
      `SELECT id, resource_id, resource_type, source_type, source_ref, content
      FROM resource_chunks
      WHERE ${resourceClause}resource_type = '${resourceType}'
        AND team_id = '${teamId}'
      ORDER BY embedding <=> '${vectorLiteral}'::vector
      LIMIT ${CANDIDATE_LIMIT}`,
    );

    return rows.map((r: Record<string, unknown>) => this.rowToChunk(r));
  }

  private async bm25Search(
    resourceId: string,
    resourceType: "category" | "resource",
    teamId: string,
    query: string,
    skipResourceId: boolean,
  ): Promise<RetrievedChunk[]> {
    const sql = skipResourceId
      ? `SELECT id, resource_id, resource_type, source_type, source_ref, content
      FROM resource_chunks
      WHERE resource_type = $1
        AND team_id = $2
        AND content_tsv @@ plainto_tsquery('english', $3)
      ORDER BY ts_rank_cd(content_tsv, plainto_tsquery('english', $3)) DESC
      LIMIT $4`
      : `SELECT id, resource_id, resource_type, source_type, source_ref, content
      FROM resource_chunks
      WHERE resource_id = $1
        AND resource_type = $2
        AND team_id = $3
        AND content_tsv @@ plainto_tsquery('english', $4)
      ORDER BY ts_rank_cd(content_tsv, plainto_tsquery('english', $4)) DESC
      LIMIT $5`;
    const params = skipResourceId
      ? [resourceType, teamId, query, CANDIDATE_LIMIT]
      : [resourceId, resourceType, teamId, query, CANDIDATE_LIMIT];
    const rows = await this.chunkRepo.query(sql, params);

    return rows.map((r: Record<string, unknown>) => this.rowToChunk(r));
  }

  /**
   * Reciprocal Rank Fusion: each candidate scored as Σ 1 / (k + rank_i).
   * Preserves diversity across lexical and semantic signals.
   */
  private rrfFuse(
    vectorHits: RetrievedChunk[],
    bm25Hits: RetrievedChunk[],
  ): RetrievedChunk[] {
    const scores = new Map<string, { chunk: RetrievedChunk; score: number }>();
    const accumulate = (list: RetrievedChunk[]) => {
      list.forEach((chunk, idx) => {
        const existing = scores.get(chunk.id);
        const add = 1 / (RRF_K + idx + 1);
        if (existing) existing.score += add;
        else scores.set(chunk.id, { chunk, score: add });
      });
    };
    accumulate(vectorHits);
    accumulate(bm25Hits);

    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .map((s) => s.chunk);
  }

  private async llmRerank(
    query: string,
    candidates: RetrievedChunk[],
    topK: number,
    teamId: string,
  ): Promise<RetrievedChunk[]> {
    if (candidates.length <= topK) return candidates;

    const numbered = candidates
      .map(
        (c, i) =>
          `[${i + 1}] ${c.content
            .slice(0, RERANK_SNIPPET_CHARS)
            .replace(/\s+/g, " ")}`,
      )
      .join("\n");

    const prompt = `You are a relevance ranker. Pick the ${topK} passages most useful for answering the query.

Query:
${query}

Candidate passages:
${numbered}

Respond ONLY with JSON of the form {"ranked": [n1, n2, ...]} using the 1-based indices above, in order of most useful first. No prose.`;

    try {
      const raw = await this.llmService.completeUserPrompt(prompt, {
        teamId: teamId,
        maxTokens: 256,
      });
      const parsed = this.parseRankedIndices(raw, candidates.length);
      if (!parsed.length) return candidates.slice(0, topK);

      const seen = new Set<number>();
      const ordered: RetrievedChunk[] = [];
      for (const idx of parsed) {
        if (seen.has(idx)) continue;
        seen.add(idx);
        ordered.push(candidates[idx - 1]);
        if (ordered.length >= topK) break;
      }
      return ordered.length ? ordered : candidates.slice(0, topK);
    } catch (err) {
      this.logger.warn(
        `LLM rerank failed, falling back to RRF order: ${
          (err as Error).message
        }`,
      );
      return candidates.slice(0, topK);
    }
  }

  private parseRankedIndices(raw: string, max: number): number[] {
    const match = raw.match(/\{[\s\S]*\}/);
    const jsonText = match ? match[0] : raw;
    try {
      const obj = JSON.parse(jsonText);
      const list = (obj?.ranked ?? []) as unknown[];
      return list
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= max);
    } catch {
      return [];
    }
  }

  private rowToChunk(r: Record<string, unknown>): RetrievedChunk {
    return {
      id: String(r.id),
      resourceId: String(r.resource_id),
      sourceType: r.source_type as ChunkSourceType,
      sourceRef: (r.source_ref as string) ?? null,
      content: String(r.content),
    };
  }
}
