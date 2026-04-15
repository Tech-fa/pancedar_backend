import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ClientBaseEntity } from "../client/client-base";
import { Team } from "../team/team.entity";
import { ConnectorStatus } from "./dto";

@Entity("connectors")
export class Connector extends ClientBaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  @Column({ name: "credentials", type: "text", nullable: true })
  credentials: string;

  @Column({ name: "connector_type_id", type: "varchar", length: 36 })
  connectorTypeId: string;

  @Column({ name: "status", type: "varchar", length: 255 })
  status: ConnectorStatus;

  @Column({
    name: "created_at",
    type: "bigint",
  })
  createdAt: number;

  @ManyToOne(() => Team)
  @JoinColumn({ name: "team_id" })
  team: Team;

  @Column({ name: "team_id", type: "varchar", length: 36 })
  teamId: string;

  @Column({
    name: "updated_at",
    type: "bigint",
  })
  updatedAt: number;
}
