import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../user/user.entity";

@Entity("teams")
@Index(["name"], { unique: true })
export class Team {
  constructor(data: Partial<Team>) {
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

  @OneToMany(() => TeamMember, (m) => m.team, { cascade: true })
  members: TeamMember[];
}

@Entity("team_members")
@Index(["team", "user"], { unique: true })
export class TeamMember {
  constructor(data: Partial<TeamMember>) {
    Object.assign(this, data);
  }

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

  @Column({ name: "created_at", type: "bigint" })
  createdAt: number;
}
