import { Injectable, Logger } from "@nestjs/common";
import { unlink } from "fs/promises";
import { TelegramWebhookUpdateDto } from "src/connector/telegram/dto";
import {
  extractMessage,
  sendMessage,
  sendPhoto,
} from "src/connector/telegram/telegram-util";
import { RealBrowserService } from "src/resource-ingestion/real-browser";
import { TeamService } from "src/team/team.service";
import { WorkflowRunStatus } from "../dto";
import { WorkflowService } from "../workflow.service";
import {
  CARLETON_PARKING_WORKFLOW_TYPE,
  CarletonParkingWorkflowService,
  TELEGRAM_CAR_AGENT_CONNECTOR_TYPE,
} from "./carleton-parking-workflow.service";

@Injectable()
export class CarletonParkingWebhookHandler {
  private readonly logger = new Logger(CarletonParkingWebhookHandler.name);

  constructor(
    private readonly workflowService: WorkflowService,
    private readonly carletonParkingWorkflowService: CarletonParkingWorkflowService,
    private readonly teamService: TeamService,
    private readonly realBrowserService: RealBrowserService,
  ) {}

  async handleWebhook(body: TelegramWebhookUpdateDto): Promise<string> {
    const botToken = process.env.TELEGRAM_CARELTON_BOT_TOKEN;
    if (!botToken?.trim()) {
      this.logger.error("TELEGRAM_CARELTON_BOT_TOKEN is not set");
      return "ok";
    }
    console.log("here");
    const message = extractMessage(body);
    if (!message?.chat?.id) {
      return "ok";
    }

    const username = message.from?.username;
    if (!username) {
      await sendMessage(
        message.chat.id,
        "Please set a Telegram username on your account so we can find your workflow.",
        {
          botToken,
        },
      );
      return "ok";
    }

    const userText = (message.text ?? message.caption ?? "").trim();
    if (!userText) {
      await sendMessage(
        message.chat.id,
        "Send a text message with your parking details.",
        { botToken },
      );
      return;
    }

    const workflow = (
      await this.workflowService.findWorkflowsByPrimaryIdentifier(
        username,
        [TELEGRAM_CAR_AGENT_CONNECTOR_TYPE],
        CARLETON_PARKING_WORKFLOW_TYPE,
      )
    )[0];

    if (!workflow) {
      this.logger.warn(
        `No carleton-parking workflow for Telegram user ${username}`,
      );
      await sendMessage(
        message.chat.id,
        "No Carleton parking workflow is linked to your Telegram username.",
        { botToken },
      );
      return "ok";
    }

    let workflowRun = await this.workflowService.findWorkgetWorkflowRunByContextWorkflowId(
      {
        workflowId: workflow.id,
        context: {
          chatId: message.chat.id,
          username,
          primaryIdentifier: username,
        },
      },
    );
    if (!workflowRun) {
      workflowRun = await this.workflowService.createWorkflowRunFromPrimaryIdentifier(
        {
          primaryIdentifier: username,
          workflowName: workflow.workflowType,
          connectorTypeId: workflow.linkedConnectors[0].connectorTypeId,
          injectContext: () => ({
            chatId: message.chat.id,
            username,
          }),
          displayContext: {},
        },
      );
    }
    this.logger.log(
      `Carleton parking workflowRun ${workflowRun.id} for workflow ${workflow.id}`,
    );

    const registerCarValues = this.carletonParkingWorkflowService.getRegisterCarStepValues(
      workflow,
    );
    if (!registerCarValues) {
      await sendMessage(
        message.chat.id,
        'Your workflow is missing the "register-car" step configuration.',
        { botToken },
      );
      return "ok";
    }

    const teamConfig = await this.teamService.getDecryptedConfigByTeamId(
      workflow.teamId,
      "chatBot",
    );
    const llmAgent = teamConfig.llmAgent as
      | { apiUrl?: string; apiKey?: string; model?: string }
      | undefined;

    const existingRegisterCtx =
      (workflowRun.stepsContext ?? {})["register-car"] ?? {};

    const result = await this.carletonParkingWorkflowService.extractParkingDetailsFromMessage(
      userText,
      registerCarValues,
      existingRegisterCtx,
      llmAgent ?? {},
    );

    const nextRegisterCtx = {
      ...existingRegisterCtx,
      address: result.address,
      unitNumber: result.unitNumber,
      licensePlate: result.licensePlate,
      numberOfNights: result.numberOfNights,
    };

    workflowRun = await this.workflowService.updateWorkflowRun(workflowRun.id, {
      stepsContext: {
        ...(workflowRun.stepsContext ?? {}),
        "register-car": nextRegisterCtx,
      },
      updatedAt: Date.now(),
    });

    const hasAllFields =
      Boolean(result.address?.trim()) &&
      Boolean(result.unitNumber?.trim()) &&
      Boolean(result.licensePlate?.trim()) &&
      result.numberOfNights != null &&
      result.numberOfNights > 0;

    if (!hasAllFields) {
      await sendMessage(message.chat.id, this.formatReply(result), {
        botToken,
      });
      return "ok";
    }

    this.registerCar(message.chat.id, botToken, workflowRun.id, {
      address: result.address!.trim(),
      unitNumber: result.unitNumber!.trim(),
      licensePlate: result.licensePlate!.trim(),
      numberOfNights: result.numberOfNights!,
    });
    return "ok";
  }

  private async registerCar(
    chatId: number,
    botToken: string,
    workflowRunId: string,
    details: {
      address: string;
      unitNumber: string;
      licensePlate: string;
      numberOfNights: number;
    },
  ): Promise<void> {
    let screenshotPath: string | null = null;
    try {
      await sendMessage(chatId, "Submitting registration…", { botToken });
      screenshotPath = await this.realBrowserService.carletonParkingRegistration(
        details,
      );
      await sendPhoto(chatId, screenshotPath, { botToken });
      await sendMessage(chatId, "Registration completed successfully", {
        botToken,
      });
    } catch (error) {
      this.logger.error("Carleton registerCar failed", {
        message: (error as Error)?.message,
        stack: (error as Error)?.stack,
      });
      await sendMessage(
        chatId,
        `Registration could not be completed: ${(error as Error).message}`,
        { botToken },
      );
      return;
    } finally {
      if (screenshotPath) {
        await unlink(screenshotPath).catch(() => {});
      }
    }

    await this.workflowService.updateWorkflowRun(workflowRunId, {
      status: WorkflowRunStatus.COMPLETED,
      updatedAt: Date.now(),
      completedView: {
        subject: "Carleton parking registration",
        id: workflowRunId,
      },
    });
  }

  private formatReply(result: {
    address: string | null;
    unitNumber: string | null;
    licensePlate: string | null;
    numberOfNights: number | null;
    messageToUser: string | null;
  }): string {
    if (result.messageToUser?.trim()) {
      return result.messageToUser.trim();
    }
    const lines = [
      "Here is what I parsed:",
      `Address: ${result.address ?? "—"}`,
      `Unit: ${result.unitNumber ?? "—"}`,
      `License plate: ${result.licensePlate ?? "—"}`,
      `Nights: ${result.numberOfNights ?? "—"}`,
    ];
    return lines.join("\n");
  }
}
