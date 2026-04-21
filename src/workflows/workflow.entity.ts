import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { Events } from "../queue/queue-constants";
import { WorkflowStepDto } from "./dto";

@Entity("workflows")
export class Workflow {
  constructor(props: Partial<Workflow>) {
    Object.assign(this, props);
  }

  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  @Column({ name: "description", type: "text", nullable: true })
  description: string | null;

  @Column({ name: "trigger_queue", type: "varchar", length: 255 })
  triggerQueue: Events;

  @Column({ name: "steps", type: "json", nullable: true })
  steps: WorkflowStepDto[];

  @Column({ name: "context", type: "json", nullable: true })
  context: Record<string, any>;

  @Column({
    name: "created_at",
    type: "bigint",
  })
  createdAt: number;

  @Column({
    name: "updated_at",
    type: "bigint",
  })
  updatedAt: number;

  @Column({ name: "team_id", type: "varchar", length: 36 })
  @Index()
  teamId: string;
}
