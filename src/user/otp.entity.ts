import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ClientBaseEntity } from '../client/client-base';
@Entity()
export class Otp extends ClientBaseEntity {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ name: 'email', unique: true, default: null })
  email: string;

  @Column({ unique: true })
  code: string;

  @Column({ type: 'bigint' })
  created: number;
}
