import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { UsersModule } from '../user/user.module';
import { QueueModule } from '../queue/queue.module';
import { CostModule } from '../cost/cost.module';

@Module({
  imports: [UsersModule, QueueModule, CostModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmIntegrationModule {}
