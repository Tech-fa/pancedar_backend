import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "../user/user.entity";
import { Team } from "src/team/team.entity";

@Entity("histories")
@Index(["entityId", "entityType"])
export class History {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "entity_type" })
  entityType: string;

  @Column({ name: "entity_id" })
  entityId: string;

  @Column({ name: "changes", type: "json" })
  changes: { [key: string]: { oldValue: any; newValue: any } };

  @Column({ name: "action" })
  action: string; // CREATE, UPDATE, DELETE

  @Column({ name: "created_at", type: "bigint" })
  createdAt: number;

  @ManyToOne(() => Team)
  @JoinColumn({ name: "team_id" })
  team: Team;
  @Column({ name: "team_id", type: "varchar" })
  teamId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;
}
