import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { WorkflowRun } from "../workflow-run.entity";

@Entity("linkedin_leads")
export class LinkedInLead {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "workflow_run_id", type: "varchar", length: 36 })
  workflowRunId: string;

  @ManyToOne(() => WorkflowRun)
  @JoinColumn({ name: "workflow_run_id" })
  workflowRun: WorkflowRun;

  @Column({ name: "search_url", type: "text" })
  searchUrl: string;

  @Column({ name: "profile_url", type: "text",})
  profileUrl: string;

  @Column({ name: "name", type: "varchar", length: 512, nullable: true })
  name: string | null;

  @Column({ name: "position", type: "varchar", length: 1024, nullable: true })
  position: string | null;

  @Column({ name: "outreach_summary", type: "text", nullable: true })
  outreachSummary: string | null;

  @Column({
    name: "status",
    type: "varchar",
    length: 32,
    default: "pending",
  })
  status: "pending" | "completed" | "failed" | "skipped";

  @Column({ name: "skip_reason", type: "varchar", length: 255, nullable: true })
  skipReason: string | null;

  @Column({ name: "created_at", type: "bigint" })
  createdAt: number;

  @Column({ name: "updated_at", type: "bigint" })
  updatedAt: number;
}
