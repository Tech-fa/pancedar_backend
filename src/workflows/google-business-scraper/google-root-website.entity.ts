import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { WorkflowRun } from "../workflow-run.entity";
import { GoogleFlaggedPage } from "./google-flagged-page.entity";

/** One row per scraped site root (normalized URL) within a workflow run; contact fields from landing + contact-style pages. */
@Entity("google_root_websites")
export class GoogleRootWebsite {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "team_id", type: "varchar", length: 36, nullable: true })
  teamId: string | null;

  @Column({
    name: "workflow_run_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  workflowRunId: string | null;

  @ManyToOne(() => WorkflowRun, (workflowRun) => workflowRun.id)
  @JoinColumn({ name: "workflow_run_id" })
  workflowRun: WorkflowRun;

  @Column({ name: "google_maps_search_url", type: "text", nullable: true })
  googleMapsSearchUrl: string | null;

  @Column({ name: "website_url", type: "varchar", length: 2048 })
  websiteUrl: string;

  @Column({ name: "phones", type: "json", nullable: true })
  phones: string[];

  @Column({ name: "emails", type: "json", nullable: true })
  emails: string[];

  @Column({ name: "linkedin_url", type: "varchar", length: 2048, nullable: true })
  linkedinUrl: string | null;

  /** Best-matching LinkedIn member profile URL from company /people outreach. */
  @Column({
    name: "linkedin_contact_profile_url",
    type: "varchar",
    length: 2048,
    nullable: true,
  })
  linkedinContactProfileUrl: string | null;

  /** LLM-generated icebreaker message tailored to the contact's recent activity. */
  @Column({ name: "linkedin_outreach_summary", type: "text", nullable: true })
  linkedinOutreachSummary: string | null;

  @Column({ name: "created_at", type: "bigint" })
  createdAt: number;

  @Column({ name: "updated_at", type: "bigint" })
  updatedAt: number;

  @OneToMany(() => GoogleFlaggedPage, (page) => page.googleRootWebsite)
  pages: GoogleFlaggedPage[];
}
