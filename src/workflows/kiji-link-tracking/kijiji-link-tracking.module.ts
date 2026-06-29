import { Module, OnModuleInit } from "@nestjs/common";
import { QueueModule } from "../../queue/queue.module";
import { KijijiLinkTrackingController } from "./kijiji-link-tracking.controller";
import { WorkflowModule } from "../workflow.module";
import { CachingModule } from "src/cache/cache.module";
import { KijijiLinkNotificationHandler } from "./kijiji-link-notification.handler";
import { registerWebhook } from "src/connector/telegram/telegram-util";

@Module({
  imports: [QueueModule, WorkflowModule, CachingModule],
  controllers: [KijijiLinkTrackingController],
  providers: [KijijiLinkNotificationHandler],
  exports: [],
})
export class KijijiLinkTrackingModule implements OnModuleInit {
  constructor() {}

  onModuleInit() {
    if (
      process.env.TELEGRAM_BOT_TOKEN &&
      process.env.TELEGRAM_WEBHOOK_PATH &&
      process.env.ENABLE_TELEGRAM_WEBHOOK == "true"
    ) {
      registerWebhook(
        process.env.TELEGRAM_BOT_TOKEN,
        `${process.env.API_URL}/${process.env.TELEGRAM_WEBHOOK_PATH}`,
      );
    }
  }
}
