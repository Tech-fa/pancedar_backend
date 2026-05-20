import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { WorkflowRun } from "../workflow-run.entity";

export type SeoBlogResearchEntry = {
  title: string;
  url: string;
  snippet: string;
};

@Entity("seo_blog_drafts")
export class SeoBlogDraft {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "team_id", type: "varchar", length: 36 })
  teamId: string;

  @Column({ name: "workflow_run_id", type: "varchar", length: 36 })
  workflowRunId: string;

  @ManyToOne(() => WorkflowRun)
  @JoinColumn({ name: "workflow_run_id" })
  workflowRun: WorkflowRun;

  @Column({ name: "topic", type: "text" })
  topic: string;

  @Column({ name: "research", type: "json", nullable: true })
  research: SeoBlogResearchEntry[] | null;

  @Column({ name: "blog_content", type: "longtext" })
  blogContent: string;

  @Column({ name: "linkedin_content", type: "longtext" })
  linkedinContent: string;

  @Column({ name: "blog_filename", type: "varchar", length: 512 })
  blogFilename: string;

  @Column({
    name: "status",
    type: "varchar",
    length: 32,
    default: "draft",
  })
  status: "draft" | "published";

  @Column({ name: "created_at", type: "bigint" })
  createdAt: number;

  @Column({ name: "updated_at", type: "bigint" })
  updatedAt: number;
}
