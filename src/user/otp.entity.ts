import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
@Entity()
export class Otp {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ name: 'email', unique: true, default: null })
  email: string;

  @Column({ unique: true })
  code: string;

  @Column({ type: 'bigint' })
  created: number;
}
