import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { WorkflowRun } from "../workflow-run.entity";
import { GoogleRootWebsite } from "./google-root-website.entity";

/** Keyword hits from PROCESS_WEBSITE jobs (Google Maps → business site crawl). */
@Entity("google_flagged_pages")
export class GoogleFlaggedPage {
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

  @Column({
    name: "google_root_website_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  googleRootWebsiteId: string | null;

  @ManyToOne(() => GoogleRootWebsite, { onDelete: "SET NULL" })
  @JoinColumn({ name: "google_root_website_id" })
  googleRootWebsite: GoogleRootWebsite | null;

  @Column({ name: "google_maps_search_url", type: "text", nullable: true })
  googleMapsSearchUrl: string | null;

  @Column({ name: "website_url", type: "varchar", length: 2048 })
  websiteUrl: string;

  @Column({ name: "page_url", type: "varchar", length: 2048 })
  pageUrl: string;

  @Column({ name: "matched_keywords", type: "json" })
  matchedKeywords: string[];

  @Column({ name: "text_snippet", type: "text", nullable: true })
  textSnippet: string | null;

  @Column({ name: "created_at", type: "bigint" })
  createdAt: number;

  @Column({ name: "updated_at", type: "bigint" })
  updatedAt: number;
}
