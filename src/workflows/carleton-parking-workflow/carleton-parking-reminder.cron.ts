import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { sendMessage } from "src/connector/telegram/telegram-util";
import { WorkflowService } from "../workflow.service";
import {
  CARLETON_PARKING_WORKFLOW_TYPE,
  CarletonParkingWorkflowService,
} from "./carleton-parking-workflow.service";

const REMINDER_TEXT =
  "want me to register your car in carleton parking?";

@Injectable()
export class CarletonParkingReminderCron {
  private readonly logger = new Logger(CarletonParkingReminderCron.name);

  constructor(
    private readonly workflowService: WorkflowService,
    private readonly carletonParkingWorkflowService: CarletonParkingWorkflowService,
  ) {}

  /** Every day at 8:00 PM (server local time). */
  @Cron("0 20 * * *")
  async sendDailyRegistrationReminder(): Promise<void> {
    const botToken = process.env.TELEGRAM_CARELTON_BOT_TOKEN?.trim();
    if (!botToken) {
      this.logger.warn(
        "Skipping Carleton parking reminder: TELEGRAM_CARELTON_BOT_TOKEN is not set",
      );
      return;
    }

    const workflows = await this.workflowService.findAllByWorkflowType(
      CARLETON_PARKING_WORKFLOW_TYPE,
    );

    for (const workflow of workflows) {
      const values =
        this.carletonParkingWorkflowService.getRegisterCarStepValues(workflow);
      const rawChatId = values?.chatId;
      if (
        rawChatId === undefined ||
        rawChatId === null ||
        (typeof rawChatId === "string" && !rawChatId.trim())
      ) {
        continue;
      }

      const chatId =
        typeof rawChatId === "number"
          ? rawChatId
          : typeof rawChatId === "string"
            ? rawChatId.trim()
            : String(rawChatId);

      try {
        await sendMessage(chatId, REMINDER_TEXT, { botToken });
        this.logger.log(
          `Sent Carleton parking reminder for workflow ${workflow.id}`,
        );
      } catch (error) {
        this.logger.warn(
          `Carleton parking reminder failed for workflow ${workflow.id}: ${(error as Error)?.message}`,
        );
      }
    }
  }
}
