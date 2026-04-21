import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Team } from "../team/team.entity";
import { WorkflowRun } from "../workflows/workflow-run.entity";

@Entity("costs")
@Index(["teamId"])
@Index(["workflowRunId"])
export class Cost {
  constructor(data: Partial<Cost>) {
    Object.assign(this, data);
  }

  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Team)
  @JoinColumn({ name: "team_id" })
  team: Team;

  @Column({ name: "team_id", type: "varchar", length: 255 })
  teamId: string;

  /** Optional – null when the LLM call is not part of a workflow run */
  @ManyToOne(() => WorkflowRun, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "workflow_run_id" })
  workflowRun: WorkflowRun | null;

  @Column({
    name: "workflow_run_id",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  workflowRunId: string | null;

  /** Exact model name sent to the API, e.g. 'gpt-4o-mini' */
  @Column({ name: "llm_model_name", type: "varchar", length: 255 })
  llmModelName: string;

  /** Total input (prompt) tokens – includes both cache hits and cache misses */
  @Column({ name: "llm_model_tokens_input", type: "int", unsigned: true })
  llmModelTokensInput: number;

  /** Number of output (completion) tokens consumed */
  @Column({ name: "llm_model_tokens_output", type: "int", unsigned: true })
  llmModelTokensOutput: number;

  /** Prompt tokens served from the provider's prompt cache (billed at a lower rate) */
  @Column({ name: "llm_model_tokens_cache_hit", type: "int", unsigned: true, default: 0 })
  llmModelTokensCacheHit: number;

  /** Provider API identifier, e.g. 'openai', 'anthropic', 'google', 'unknown' */
  @Column({ name: "llm_model_api", type: "varchar", length: 100 })
  llmModelApi: string;

  /** Calculated USD cost (8 decimal places for sub-cent precision) */
  @Column({
    name: "llm_model_cost",
    type: "decimal",
    precision: 18,
    scale: 8,
    default: 0,
  })
  llmModelCost: number;

  @Column({ name: "created_at", type: "bigint" })
  createdAt: number;

  @Column({ name: "month", type: "varchar", length: 255 })
  month: string;
  @Column({ name: "year", type: "varchar", length: 255 })
  year: string;
}
