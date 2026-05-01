import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import { Events, getListening } from '../../queue/queue-constants';
import { GoogleSerivce } from './google.service';
import { Public } from '../../util/constants';
import { ConnectorService } from '../connector.service';
import { GmailWorkflowReplyPayload } from '../../email-handler/dto';
import { Connector } from '../connector.entity';
import { GoogleConnectorAuthService } from '../google-connector-auth.service';
import { GoogleBusinessReviewsService } from '../google-business-reviews/google-business-reviews.service';

@Injectable()
export class GoogleRabbitHandler {
  private readonly logger = new Logger(GoogleRabbitHandler.name);

  constructor(
    private readonly googleService: GoogleSerivce,
    private readonly googleBusinessReviewsService: GoogleBusinessReviewsService,
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
        error.stack,
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
      const googleAuthService = this.googleAuthServiceForConnector(connector);
      if (!googleAuthService) {
        this.logger.warn(
          `No Google token renewal service for connector type ${connector.connectorTypeId}`,
        );
        return;
      }

      const credential =
        await googleAuthService.renewTokenForConnector(connector);
      if (!credential) {
        this.logger.warn(
          `Could not renew token for connector ${payload.connectorId}`,
        );
        return;
      }

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

  private googleAuthServiceForConnector(
    connector: Connector,
  ): GoogleConnectorAuthService | null {
    const connectorType = (connector.connectorTypeId || '').toLowerCase();
    if (connectorType === 'gmail') {
      return this.googleService;
    }
    if (connectorType === 'google business reviews') {
      return this.googleBusinessReviewsService;
    }
    return null;
  }
}
