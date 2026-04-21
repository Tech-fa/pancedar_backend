import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { Connector } from "../connector/connector.entity";
import { WorkflowRun } from "src/workflows/workflow-run.entity";
export enum EmailProcessingStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

@Entity("user_incoming_emails")
export class UserIncomingEmail {
  @PrimaryColumn()
  id: string;

  @ManyToOne(() => Connector, { onDelete: "CASCADE" })
  @JoinColumn({ name: "connector_id" })
  connector: Connector;

  @Column({ name: "connector_id", type: "varchar", length: 255 })
  connectorId: string;

  @Column({ name: "from", type: "varchar", length: 255 })
  from: string;

  @Column({ name: "subject", type: "varchar", length: 500, nullable: true })
  subject: string;

  @Column({ name: "html_text", type: "longtext", nullable: true })
  htmlText: string;

  @Column({ name: "text", type: "longtext", nullable: true })
  text: string;

  @Column({ name: "message_id", type: "varchar", length: 255 })
  messageId: string;

  @Column({ name: "attachments", type: "json", nullable: true })
  attachments: string[];

  @Column({ name: "summary", type: "text", nullable: true })
  summary: string;

  @Column({ name: "has_unsubscribe", type: "boolean", default: false })
  hasUnsubscribe: boolean;

  @Column({ name: "is_processed", type: "boolean", default: false })
  isProcessed: boolean;

  @Column({
    name: "processing_status",
    type: "enum",
    enum: EmailProcessingStatus,
    default: EmailProcessingStatus.PENDING,
  })
  processingStatus: EmailProcessingStatus;

  @Column({ name: "processed_at", type: "bigint", nullable: true })
  processedAt: number;

  @Column({ name: "processing_attempts", type: "int", default: 0 })
  processingAttempts: number;

  @Column({ name: "creation_date", type: "bigint" })
  creationDate: number;

  @Column({
    name: "created_at",
    type: "bigint",
  })
  createdAt: number;

  @ManyToOne(() => WorkflowRun, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workflow_run_id" })
  workflowRun: WorkflowRun;

  @Column({ name: "workflow_run_id", type: "varchar", length: 36, nullable: true })
  workflowRunId: string;
}
