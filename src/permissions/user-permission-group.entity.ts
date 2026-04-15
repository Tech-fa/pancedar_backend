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
import { ClientBaseEntity } from "../client/client-base";
import { Team } from "../team/team.entity";

@Entity("user_permission_groups")
@Unique(["user", "permissionGroup", "team"])
export class UserPermissionGroup extends ClientBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => Team)
  @JoinColumn({ name: "team_id" })
  team: Team;

  @Column({ name: "team_id", type: "varchar" })
  teamId: string;

  @ManyToOne(() => PermissionGroup)
  @JoinColumn({ name: "permission_group_id" })
  permissionGroup: PermissionGroup;
}
