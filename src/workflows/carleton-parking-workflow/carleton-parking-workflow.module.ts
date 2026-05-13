import { Module, OnModuleInit } from "@nestjs/common";
import { ResourceIngestionModule } from "src/resource-ingestion/resource-ingestion.module";
import { TeamModule } from "src/team/team.module";
import { TelegramModule } from "src/connector/telegram/telegram.module";
import { registerWebhook } from "src/connector/telegram/telegram-util";
import { WorkflowModule } from "../workflow.module";
import { CarletonParkingWorkflowController } from "./carleton-parking-workflow.controller";
import { CarletonParkingWebhookHandler } from "./carleton-parking-webhook.handler";
import { CarletonParkingWorkflowService } from "./carleton-parking-workflow.service";

@Module({
  imports: [
    WorkflowModule,
    TelegramModule,
    ResourceIngestionModule,
    TeamModule,
  ],
  controllers: [CarletonParkingWorkflowController],
  providers: [CarletonParkingWebhookHandler, CarletonParkingWorkflowService],
  exports: [CarletonParkingWorkflowService],
})
export class CarletonParkingWorkflowModule implements OnModuleInit {
  onModuleInit() {
    const token = process.env.TELEGRAM_CARELTON_BOT_TOKEN;
    if (
      token?.trim() &&
      process.env.ENABLE_TELEGRAM_CARELTON_WEBHOOK === "true"
    ) {
      registerWebhook(
        token.trim(),
        `${process.env.API_URL}/carleton-parking-workflow/webhook`,
      );
    }
  }
}
