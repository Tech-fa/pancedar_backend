import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  OneToMany,
} from 'typeorm';
import { PermissionScope } from './permissions';
import { PermissionsDTO } from './dto';
import { ClientBaseEntity } from '../client/client-base';
import { UserPermissionGroup } from './user-permission-group.entity';

@Entity('permission_groups')
@Unique(['client', 'name'])
export class PermissionGroup extends ClientBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'json' })
  permissions: PermissionsDTO[];

  @Column({ default: false })
  custom: boolean;

  @Column({ default: false })
  deleted: boolean;

  @OneToMany(
    () => UserPermissionGroup,
    (userPermissionGroup) => userPermissionGroup.permissionGroup,
  )
  userPermissionGroups: UserPermissionGroup[];

  @Column({ type: 'text', nullable: true })
  description: string;
}
