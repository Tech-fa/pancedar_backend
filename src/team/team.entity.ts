import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ClientBaseEntity } from "../client/client-base";
import { User } from "../user/user.entity";

@Entity("teams")
@Index(["clientId", "name"], { unique: true })
export class Team extends ClientBaseEntity {
  constructor(data: Partial<Team>) {
    super();
    Object.assign(this, data);
  }

  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "name", type: "varchar", length: 255 })
  name: string;

  @Column({ name: "created_at", type: "bigint" })
  createdAt: number;

  @Column({ name: "updated_at", type: "bigint" })
  updatedAt: number;

  @OneToMany(() => TeamMember, (m) => m.team)
  members: TeamMember[];
}

@Entity("team_members")
@Index(["team", "user"], { unique: true })
export class TeamMember extends ClientBaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Team, (team) => team.members, { onDelete: "CASCADE" })
  @JoinColumn({ name: "team_id" })
  team: Team;

  @Column({ name: "team_id", type: "varchar" })
  teamId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id", type: "varchar" })
  userId: string;

  @Column({ name: "is_compliant", type: "boolean", default: false })
  isCompliant: boolean;

  @Column({ name: "created_at", type: "bigint" })
  createdAt: number;
}
