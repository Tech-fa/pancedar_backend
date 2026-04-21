import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { WorkflowEmailCategory } from "./category.entity";

@Entity("workflow_email_category_resources")
export class WorkflowEmailCategoryResource {
  constructor(data: Partial<WorkflowEmailCategoryResource>) {
    Object.assign(this, data);
  }

  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => WorkflowEmailCategory, (c) => c.resource, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "category_id" })
  category: WorkflowEmailCategory;

  @Column({ name: "category_id", type: "varchar", length: 36 })
  categoryId: string;

  @Column({ name: "text_resource", type: "text", nullable: true })
  textResource: string | null;

  @Column({ name: "links", type: "json", nullable: true })
  links: string[];

  @Column({ name: "files", type: "json", nullable: true })
  files: string[];

  @Column({ name: "all_text", type: "varchar", length: 500, nullable: true })
  allText: string | null;
}
