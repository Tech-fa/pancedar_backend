import { Injectable, Logger } from "@nestjs/common";
import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { ConfigService } from "@nestjs/config";
import { Events, getListening } from "../queue/queue-constants";
import { Public } from "../util/constants";
import { AgentCommunicationService } from "./agent-communication.service";

@Injectable()
export class AgentQueueHandler {
  private readonly logger = new Logger(AgentQueueHandler.name);
  constructor(
    private readonly agentCommunicationService: AgentCommunicationService,
  ) {}

  @RabbitSubscribe(getListening(Events.RECORD_COMMUNICATION))
  @Public()
  async handleRecordCommunication(data: {
    role: string;
    content: string;
    workflowRunId: string;
  }) {
    try {
      await this.agentCommunicationService.recordCommunication(data);
    } catch (error) {
      this.logger.error("Failed to record communication:", error);
    }
  }
}
