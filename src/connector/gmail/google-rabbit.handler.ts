import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { Injectable, Logger } from "@nestjs/common";
import { Events, getListening } from "../../queue/queue-constants";
import { GoogleSerivce } from "./google.service";
import { Public } from "../../util/constants";
import { ConnectorService } from "../connector.service";
import { GmailWorkflowReplyPayload } from "../../email-handler/dto";

@Injectable()
export class GoogleRabbitHandler {
  private readonly logger = new Logger(GoogleRabbitHandler.name);

  constructor(
    private readonly googleService: GoogleSerivce,
    private readonly connectorService: ConnectorService,
  ) {}

  @RabbitSubscribe(getListening(Events.RENEW_WATCH))
  @Public()
  async handleRenewWatch(payload: { connectorId: string }) {
    try {
      this.logger.log(`Renewing watch for connector ${payload.connectorId}`);
      const connector = await this.connectorService.findOneById(
        payload.connectorId,
      );
      if (!connector) {
        this.logger.warn(`Connector ${payload.connectorId} not found`);
        return;
      }
      await this.googleService.renewWatch(connector);
      this.logger.log(
        `Successfully renewed watch for connector ${payload.connectorId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error renewing watch for connector ${payload.connectorId}`,
        error,
      );
    }
  }

  @RabbitSubscribe(getListening(Events.RENEW_TOKEN))
  @Public()
  async handleRenewToken(payload: { connectorId: string }) {
    try {
      this.logger.log(`Renewing token for connector ${payload.connectorId}`);
      const connector = await this.connectorService.findOneById(
        payload.connectorId,
      );
      if (!connector) {
        this.logger.warn(`Connector ${payload.connectorId} not found`);
        return;
      }
      await this.googleService.renewTokenForConnector(connector);
      this.logger.log(
        `Successfully renewed token for connector ${payload.connectorId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error renewing token for connector ${payload.connectorId}`,
        error,
      );
    }
  }

  @RabbitSubscribe(getListening(Events.EMAIL_WORKFLOW_REPLY_GMAIL))
  @Public()
  async handleWorkflowReply(payload: GmailWorkflowReplyPayload) {
    try {
      this.logger.log(
        `Sending Gmail workflow reply for incoming email ${payload.incomingEmailId}`,
      );
      await (this.googleService as any).replyToIncomingEmail(payload);
    } catch (error) {
      this.logger.error(
        `Error sending Gmail workflow reply for incoming email ${payload.incomingEmailId}`,
        error,
      );
      throw error;
    }
  }
}
