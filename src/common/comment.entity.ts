import { User } from '../user/user.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { ClientBaseEntity } from '../client/client-base';

@Entity('comments')
export class Comment extends ClientBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  text: string;

  @JoinColumn({ name: 'creator_id' })
  @ManyToOne(() => User)
  creator: User;
}
