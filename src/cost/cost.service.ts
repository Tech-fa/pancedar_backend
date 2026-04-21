import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cost } from './cost.entity';
import { calculateLlmCost } from './llm-pricing.config';
import { format } from 'date-fns';

export interface CostByModelAggregate {
  llmModelName: string;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheHitTokens: number;
  callCount: number;
}

export interface CostPeriodAggregate {
  year: string;
  month: string;
  models: CostByModelAggregate[];
}

export interface TeamCostsAggregatedResponse {
  teamId: string;
  periods: CostPeriodAggregate[];
}

export interface RecordLlmCostInput {
  teamId: string;
  workflowRunId?: string | null;
  llmModelName: string;
  llmModelTokensInput: number;
  llmModelTokensOutput: number;
  /** Prompt tokens served from the provider cache (billed at the discounted rate) */
  llmModelTokensCacheHit?: number;
}

@Injectable()
export class CostService {
  private readonly logger = new Logger(CostService.name);

  constructor(
    @InjectRepository(Cost)
    private readonly costRepository: Repository<Cost>,
  ) {}

  /**
   * Persists a single LLM call cost record.
   * The USD cost is derived automatically from the pricing config,
   * applying the discounted cache-hit rate where applicable.
   */
  async recordLlmCost(input: RecordLlmCostInput): Promise<Cost> {
    const cacheHitTokens = input.llmModelTokensCacheHit ?? 0;

    const { cost, api } = calculateLlmCost(
      input.llmModelName,
      input.llmModelTokensInput,
      input.llmModelTokensOutput,
      cacheHitTokens,
    );

    if (api === 'unknown') {
      this.logger.warn(
        `No pricing entry found for model "${input.llmModelName}" – cost recorded as 0`,
      );
    }

    const now = new Date();
    const record = new Cost({
      teamId: input.teamId,
      workflowRunId: input.workflowRunId ?? null,
      llmModelName: input.llmModelName,
      llmModelTokensInput: input.llmModelTokensInput,
      llmModelTokensOutput: input.llmModelTokensOutput,
      llmModelTokensCacheHit: cacheHitTokens,
      llmModelApi: api,
      llmModelCost: cost,
      createdAt: Date.now(),
      month: format(now, 'LLLL'),
      year: format(now, 'yyyy'),
    });

    return this.costRepository.save(record);
  }

  /** All cost records for a team, newest first. */
  async findByTeam(teamId: string): Promise<Cost[]> {
    return this.costRepository.find({
      where: { teamId },
      order: { createdAt: 'DESC' },
    });
  }

  /** All cost records linked to a specific workflow run. */
  async findByWorkflowRun(workflowRunId: string): Promise<Cost[]> {
    return this.costRepository.find({
      where: { workflowRunId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Aggregated cost summary for a team.
   * Returns total tokens and total USD cost across all recorded calls.
   */
  async getTeamCostSummary(teamId: string): Promise<{
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheHitTokens: number;
    totalCostUsd: number;
    callCount: number;
  }> {
    const result = await this.costRepository
      .createQueryBuilder('c')
      .select('SUM(c.llm_model_tokens_input)', 'totalInputTokens')
      .addSelect('SUM(c.llm_model_tokens_output)', 'totalOutputTokens')
      .addSelect('SUM(c.llm_model_tokens_cache_hit)', 'totalCacheHitTokens')
      .addSelect('SUM(c.llm_model_cost)', 'totalCostUsd')
      .addSelect('COUNT(c.id)', 'callCount')
      .where('c.team_id = :teamId', { teamId })
      .getRawOne<{
        totalInputTokens: string;
        totalOutputTokens: string;
        totalCacheHitTokens: string;
        totalCostUsd: string;
        callCount: string;
      }>();

    return {
      totalInputTokens: Number(result?.totalInputTokens ?? 0),
      totalOutputTokens: Number(result?.totalOutputTokens ?? 0),
      totalCacheHitTokens: Number(result?.totalCacheHitTokens ?? 0),
      totalCostUsd: Number(result?.totalCostUsd ?? 0),
      callCount: Number(result?.callCount ?? 0),
    };
  }

  /**
   * Costs for a team aggregated by calendar year, month, and LLM model name
   * (sums token and USD fields for each group).
   */
  async getTeamCostsAggregatedByModel(
    teamId: string,
  ): Promise<TeamCostsAggregatedResponse> {
    const raw = await this.costRepository
      .createQueryBuilder('c')
      .select('c.year', 'year')
      .addSelect('c.month', 'month')
      .addSelect('c.team_id', 'teamId')
      .addSelect('c.llm_model_name', 'llmModelName')
      .addSelect('SUM(c.llm_model_cost)', 'totalCostUsd')
      .addSelect('SUM(c.llm_model_tokens_input)', 'totalInputTokens')
      .addSelect('SUM(c.llm_model_tokens_output)', 'totalOutputTokens')
      .addSelect('SUM(c.llm_model_tokens_cache_hit)', 'totalCacheHitTokens')
      .addSelect('COUNT(c.id)', 'callCount')
      .where('c.team_id = :teamId', { teamId })
      .groupBy('c.year')
      .addGroupBy('c.month')
      .addGroupBy('c.team_id')
      .addGroupBy('c.llm_model_name')
      .orderBy('c.year', 'DESC')
      .addOrderBy('c.month', 'DESC')
      .addOrderBy('c.llm_model_name', 'ASC')
      .getRawMany<{
        year: string;
        month: string;
        teamId: string;
        llmModelName: string;
        totalCostUsd: string;
        totalInputTokens: string;
        totalOutputTokens: string;
        totalCacheHitTokens: string;
        callCount: string;
      }>();

    const periodMap = new Map<string, CostPeriodAggregate>();
    for (const row of raw) {
      const key = `${row.year}-${row.month}`;
      if (!periodMap.has(key)) {
        periodMap.set(key, {
          year: row.year,
          month: row.month,
          models: [],
        });
      }
      periodMap.get(key)!.models.push({
        llmModelName: row.llmModelName,
        totalCostUsd: Number(row.totalCostUsd ?? 0),
        totalInputTokens: Number(row.totalInputTokens ?? 0),
        totalOutputTokens: Number(row.totalOutputTokens ?? 0),
        totalCacheHitTokens: Number(row.totalCacheHitTokens ?? 0),
        callCount: Number(row.callCount ?? 0),
      });
    }

    const periods = [...periodMap.values()].sort((a, b) => {
      if (a.year !== b.year) {
        return Number(b.year) - Number(a.year);
      }
      return Number(b.month) - Number(a.month);
    });

    for (const p of periods) {
      p.models.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
    }

    return { teamId, periods };
  }
}
