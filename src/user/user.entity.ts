import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
  OneToMany,
  Index,
} from "typeorm";
import { UserPermissionGroup } from "../permissions/user-permission-group.entity";
import { ClientBaseEntity } from "../client/client-base";
import { TrackChanges, ExcludeField } from "../history/track-changes.decorator";
import { UserSkill } from "../skill/userSkill.entity";
import { UserCredential } from "./userCredendtial.entity";
import { Team } from "../team/team.entity";

export enum UserType {
  STANDARD = "standard",
  TECHNICIAN = "technician",
  PILOT = "pilot",
}

@Entity("users")
@TrackChanges()
export class User extends ClientBaseEntity {
  @PrimaryColumn({ name: "id" })
  id: string;

  @Column({ name: "fname", type: "varchar", length: 255 })
  fname: string;

  @Column({ name: "lname", type: "varchar", length: 255 })
  lname: string;

  @Column({ name: "phone", type: "varchar", length: 255, nullable: true })
  phone: string;

  @Column({ name: "email", type: "varchar", length: 255 })
  email: string;

  @Column({ name: "created_at", type: "bigint" })
  createdAt: number;

  @Column({ name: "password", type: "text" })
  @ExcludeField()
  password: string;

  @Column({ name: "failed_logins", type: "int" })
  failedLogins: number;

  @Column({ name: "is_active", type: "boolean", default: false })
  isActive: boolean;

  @Column({ name: "verified_at", type: "bigint", nullable: true })
  verifiedAt: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "created_by" })
  @ExcludeField()
  createdBy: User;

  @OneToMany(() => UserPermissionGroup, (permission) => permission.user, {
    cascade: true,
  })
  @ExcludeField()
  permissionGroups: UserPermissionGroup[];

  @Column({ name: "deleted", type: "boolean", default: false })
  @Index()
  deleted: boolean;

  @Column({
    name: "user_type",
    type: "enum",
    enum: UserType,
    default: UserType.STANDARD,
  })
  userType: UserType;

  @Column({ name: "last_login", type: "bigint", nullable: true })
  lastLogin: number;

  @OneToMany(() => UserSkill, (skill) => skill.user)
  skills: UserSkill[];

  @OneToMany(() => UserCredential, (credential) => credential.user)
  credentials: UserCredential[];
}
