import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Team } from "../team/team.entity";
import { WorkflowEmailCategoryResource } from "./category-resource.entity";

@Entity("workflow_email_categories")
@Index(["teamId", "name"], { unique: true })
export class WorkflowEmailCategory {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  @Column({ name: "description", type: "text", nullable: true })
  description: string | null;

  @Column({ name: "created_at", type: "bigint" })
  createdAt: number;

  @Column({ name: "updated_at", type: "bigint" })
  updatedAt: number;

  @OneToOne(() => WorkflowEmailCategoryResource, (r) => r.category)
  resource: WorkflowEmailCategoryResource;

  @ManyToOne(() => Team)
  @JoinColumn({ name: "team_id" })
  team: Team;

  @Column({ name: "team_id", type: "varchar", length: 36 })
  teamId: string;
}
