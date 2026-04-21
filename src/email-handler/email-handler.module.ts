import { Module } from "@nestjs/common";
import { EmailHandlerService } from "./email-handler.service";
import { QueueModule } from "../queue/queue.module";
import { CommonModule } from "../common/common.module";

@Module({
  imports: [QueueModule, CommonModule],
  providers: [EmailHandlerService],
  exports: [EmailHandlerService],
})
export class EmailHandlerModule {}
