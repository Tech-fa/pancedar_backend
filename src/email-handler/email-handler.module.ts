import { Module } from "@nestjs/common";
import { EmailHandlerService } from "./email-handler.service";
import { EmailWorkflowReplyQueueHandler } from "./email-workflow-reply-queue.handler";
import { QueueModule } from "../queue/queue.module";
import { CommonModule } from "../common/common.module";

@Module({
  imports: [QueueModule, CommonModule],
  providers: [EmailHandlerService, EmailWorkflowReplyQueueHandler],
  exports: [EmailHandlerService],
})
export class EmailHandlerModule {}
