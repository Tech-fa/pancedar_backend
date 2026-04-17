import { Injectable, Logger } from "@nestjs/common";
import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { Events, getListening } from "../../queue/queue-constants";
import { Public } from "../../util/constants";
import { EmailAssistantService } from "./email-assistant.service";
import { WorkflowService } from "../workflow.service";
import { EmailAssistantPayload } from "../steps/email/dto";

@Injectable()
export class EmailAssistantQueueHandler {
  private readonly logger = new Logger(EmailAssistantQueueHandler.name);

  constructor(private readonly emailAssistantService: EmailAssistantService) {}

  @RabbitSubscribe(getListening(Events.EMAIL_ASSISTANT))
  @Public()
  async handleEmailAssistant(payload: EmailAssistantPayload) {
    try {
      this.logger.log(
        `Received EMAIL_ASSISTANT event for workflowRun ${payload.runId}`,
      );

      await this.emailAssistantService.runWorkflow(payload);

      this.logger.log(
        `EMAIL_ASSISTANT workflowRun ${payload.runId} completed`,
      );
    } catch (error) {
      this.logger.error(
        `Error running EMAIL_ASSISTANT workflowRun ${payload.runId}`,
        error,
      );
    }
  }
}
