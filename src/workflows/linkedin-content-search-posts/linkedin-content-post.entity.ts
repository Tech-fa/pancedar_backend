import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { WorkflowRun } from "../workflow-run.entity";

@Entity("linkedin_content_posts")
export class LinkedInContentPost {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "workflow_run_id", type: "varchar", length: 36 })
  workflowRunId: string;

  @ManyToOne(() => WorkflowRun)
  @JoinColumn({ name: "workflow_run_id" })
  workflowRun: WorkflowRun;

  @Column({ name: "search_url", type: "text" })
  searchUrl: string;

  @Column({ name: "search_word", type: "varchar", length: 512 })
  searchWord: string;

  @Column({ name: "company_linkedin_url", type: "text", nullable: true })
  companyLinkedInUrl: string | null;

  @Column({ name: "company_name", type: "varchar", length: 512, nullable: true })
  companyName: string | null;

  @Column({ name: "company_location", type: "varchar", length: 512, nullable: true })
  companyLocation: string | null;

  @Column({ name: "post_content", type: "text", nullable: true })
  postContent: string | null;

  @Column({ name: "post_link", type: "text", nullable: true })
  postLink: string | null;

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
