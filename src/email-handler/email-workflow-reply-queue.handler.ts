import { Injectable, Logger } from "@nestjs/common";
import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { Events, getListening } from "../queue/queue-constants";
import { Public } from "../util/constants";
import { EmailWorkflowReplyPayload } from "./dto";

@Injectable()
export class EmailWorkflowReplyQueueHandler {
  private readonly logger = new Logger(EmailWorkflowReplyQueueHandler.name);

  @RabbitSubscribe(getListening(Events.EMAIL_WORKFLOW_REPLY))
  @Public()
  async handleEmailWorkflowReply(payload: EmailWorkflowReplyPayload) {
    try {
      this.logger.log(
        `Email workflow reply for incoming ${payload.incomingEmailId} → ${payload.replyTo}`,
      );
    } catch (error) {
      this.logger.error("Failed handling email workflow reply", error);
      throw error;
    }
  }
}
