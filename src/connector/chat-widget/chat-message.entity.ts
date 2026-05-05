import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/user/user.entity';
import { WorkflowRun } from 'src/workflows/workflow-run.entity';

export enum ChatMessageSentBy {
  USER = 'user',
  AI = 'AI',
  TEAM_MEMBER = 'teamMember',
}

@Entity('chat_messages')
@Index(['workflowRunId', 'createdAt'])
export class ChatMessageEntity {
  constructor(props?: Partial<ChatMessageEntity>) {
    Object.assign(this, props);
  }

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workflow_run_id', type: 'varchar', length: 36 })
  workflowRunId: string;

  @ManyToOne(() => WorkflowRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_run_id' })
  workflowRun: WorkflowRun;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Column({ name: 'sent_by', type: 'varchar', length: 32 })
  sentBy: ChatMessageSentBy;

  @Column({
    name: 'team_member_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  teamMemberId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'team_member_id' })
  teamMember: User | null;

  @Column({ name: 'created_at', type: 'bigint' })
  createdAt: number;
}
