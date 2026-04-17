import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { UsersModule } from '../user/user.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [UsersModule, QueueModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmIntegrationModule {}
