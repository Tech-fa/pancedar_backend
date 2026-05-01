import { Module, OnModuleInit } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { QueueModule } from "../../queue/queue.module";
import { KijijiLink, KijijiLinkSchema } from "./schemas/kijiji-link.schema";
import { KijijiLinkTrackingController } from "./kijiji-link-tracking.controller";
import { KijijiLinkService } from "./kijiji-link.service";
import { KijijiLinkTrackingService } from "./track-link";
import { WorkflowModule } from "../workflow.module";
import { CachingModule } from "src/cache/cache.module";
import { TelegramModule } from "src/connector/telegram/telegram.module";
import { KijijiLinkNotificationHandler } from "./kijiji-link-notification.handler";
import { registerWebhook } from "src/connector/telegram/telegram-util";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KijijiLink.name, schema: KijijiLinkSchema },
    ]),
    QueueModule,
    WorkflowModule,
    CachingModule,
    TelegramModule,
  ],
  controllers: [KijijiLinkTrackingController],
  providers: [
    KijijiLinkService,
    KijijiLinkTrackingService,
    KijijiLinkNotificationHandler,
  ],
  exports: [KijijiLinkService, KijijiLinkTrackingService],
})
export class KijijiLinkTrackingModule implements OnModuleInit {
  constructor() {}

  onModuleInit() {
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_PATH && process.env.ENABLE_TELEGRAM_WEBHOOK == "true") {
      console.log("registering webhook");
      registerWebhook(
        process.env.TELEGRAM_BOT_TOKEN,
       `${process.env.API_URL}/${process.env.TELEGRAM_WEBHOOK_PATH}`,
      );
    }
  }
}
