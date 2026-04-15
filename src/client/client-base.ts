import { Column, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Client } from './client.entity';
  import { ExcludeField } from '../history/track-changes.decorator';

export abstract class ClientBaseEntity {
  @ManyToOne(() => Client, { nullable: false })
  @JoinColumn({ name: 'client_id' })
  @ExcludeField() 
  client: Client;

  @Column({ nullable: false, type: 'varchar', length: 255, name: 'client_id' })
  @Index()
  clientId: string;
}
