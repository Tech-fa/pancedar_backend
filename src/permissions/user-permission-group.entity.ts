import { PermissionGroup } from "./permission-group.entity";
import { User } from "../user/user.entity";
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Column,
} from "typeorm";
import { Team } from "../team/team.entity";

@Entity("user_permission_groups")
@Unique(["user", "permissionGroup", "team"])
export class UserPermissionGroup {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id", type: "varchar", length: 36 })
  userId: string;

  @ManyToOne(() => Team)
  @JoinColumn({ name: "team_id" })
  team: Team;

  @Column({ name: "team_id", type: "varchar" })
  teamId: string;

  @ManyToOne(() => PermissionGroup)
  @JoinColumn({ name: "permission_group_id" })
  permissionGroup: PermissionGroup;
}
