import { Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Column } from "typeorm";
import { Explanation, WorkflowRunStatus } from "./dto";
import { Workflow } from "./workflow.entity";

@Entity("workflow_runs")
export class WorkflowRun {
  constructor(props: Partial<WorkflowRun>) {
    Object.assign(this, props);
  }

  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "workflow_id", type: "varchar", length: 255 })
  workflowId: string;

  @ManyToOne(() => Workflow, (workflow) => workflow.id)
  @JoinColumn({ name: "workflow_id" })
  workflow: Workflow;

  @Column({ name: "context", type: "json", nullable: true })
  context: Record<string, any>;

  @Column({ name: "display_context", type: "json", nullable: true })
  displayContext: Record<string, any>;

  @Column({ name: "created_at", type: "bigint" })
  createdAt: number;

  @Column({ name: "updated_at", type: "bigint" })
  updatedAt: number;

  @Column({ name: "status", type: "varchar", length: 255 })
  status: WorkflowRunStatus;

  @Column({ name: "completed_view", type: "json", nullable: true })
  completedView: {
    subject: string;
    id: string;
  };

  @Column({
    name: "current_step",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  currentStep: string;

  @Column({ name: "steps_context", type: "json", nullable: true })
  stepsContext: Record<string, any>;

  @Column({ name: "explanation", type: "json", nullable: true })
  explanation: Explanation;
}
