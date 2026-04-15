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
import { ClientBaseEntity } from "../client/client-base";
import { bigintTransformer } from "../util/bigint-transformer";

@Entity("workflows")
@Index(["clientId", "parentId"])
export class Workflow extends ClientBaseEntity {
  constructor(props: Partial<Workflow>) {
    super();
    Object.assign(this, props);
  }

  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  @Column({ name: "description", type: "text", nullable: true })
  description: string | null;

  @Column({
    name: "created_at",
    type: "bigint",
    transformer: bigintTransformer,
  })
  createdAt: number;

  @Column({
    name: "updated_at",
    type: "bigint",
    transformer: bigintTransformer,
  })
  updatedAt: number;

  @Column({ name: "team_id", type: "varchar", length: 36 })
  @Index()
  teamId: string;
}
