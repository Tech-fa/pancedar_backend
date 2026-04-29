import {
  Column,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Events } from "../queue/queue-constants";
import { WorkflowStepDto } from "./dto";
import { Connector } from "src/connector/connector.entity";

@Entity("workflows")
@Index(["name", "teamId"], { unique: true })
export class Workflow {
  constructor(props: Partial<Workflow>) {
    Object.assign(this, props);
  }

  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  @Column({ name: "workflow_type", type: "varchar", length: 255 })
  workflowType: string;

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

  @ManyToMany(() => Connector, (workflow) => workflow.linkedWorkflows, {
    cascade: true,
  })
  @JoinTable({
    name: "workflow_connectors",
    joinColumn: { name: "workflow_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "connector_id", referencedColumnName: "id" },
  })
  linkedConnectors: Connector[];
}
