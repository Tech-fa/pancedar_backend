import { Injectable, Logger } from "@nestjs/common";
import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { Events, getListening } from "../queue/queue-constants";
import { Public } from "../util/constants";
import { WorkflowService } from "./workflow.service";
import { UsersService } from "../user/user.service";
import { QueuePublisher } from "../queue/queue.publisher";
import { workflowConfigs } from "./workflow-config";

interface ProcessIncomingEmailPayload {
  incomingEmailId: string;
}

export interface RunWorkflowPayload {
  workflowId: string;
  context: Record<string, any>;
}

@Injectable()
export class WorkflowQueueHandler {
  private readonly logger = new Logger(WorkflowQueueHandler.name);

  constructor(
    private readonly workflowService: WorkflowService,
    private readonly usersService: UsersService,
    private readonly queuePublisher: QueuePublisher,
  ) {}

  @RabbitSubscribe(getListening(Events.PROCESS_INCOMING_EMAIL))
  @Public()
  async handleProcessIncomingEmail(payload: ProcessIncomingEmailPayload) {
    try {
      this.logger.log(`Processing incoming email ${payload.incomingEmailId}`);

      const incomingEmail = await this.usersService.findIncomingEmailById(
        payload.incomingEmailId,
        ["connector"],
      );

      if (!incomingEmail) {
        this.logger.warn(`Incoming email ${payload.incomingEmailId} not found`);
        return;
      }

      const workflows = await this.workflowService.findByTriggerQueue(
        Events.PROCESS_INCOMING_EMAIL,
        incomingEmail.connector.clientId,
        incomingEmail.connector.teamId,
      );

      if (!workflows.length) {
        this.logger.log(
          `No workflows found for PROCESS_INCOMING_EMAIL in team ${incomingEmail.connector.teamId}`,
        );
        return;
      }

      for (const workflow of workflows) {
        const workflowRun = await this.workflowService.createWorkflowRun({
          workflowId: workflow.id,
          context: {
            incomingEmailId: payload.incomingEmailId,
          },
        });
        this.logger.log(
          `Queuing workflow "${workflow.name}" (${workflow.id}) for email ${payload.incomingEmailId}`,
        );
        const event = workflowConfigs[workflow.name].processQueue;
        await this.queuePublisher.publish(event, {
          runId: workflowRun.id,
          incomingEmailId: payload.incomingEmailId,
          teamId: incomingEmail.connector.teamId,
        });
      }
    } catch (error) {
      this.logger.error(
        `Error processing incoming email ${payload.incomingEmailId}`,
        error,
      );
    }
  }
}
