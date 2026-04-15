import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import { Events, getListening } from '../../queue/queue-constants';
import { GoogleSerivce } from './google.service';
import { Public } from '../../util/constants';
import { UsersService } from '../../user/user.service';

@Injectable()
export class GoogleRabbitHandler {
  private readonly logger = new Logger(GoogleRabbitHandler.name);

  constructor(
    private readonly googleService: GoogleSerivce,
    private readonly userService: UsersService,
  ) {}

  @RabbitSubscribe(getListening(Events.RENEW_WATCH))
  @Public()
  async handleRenewWatch(payload: { inbox_email: string }) {
    try {
      this.logger.log(`Renewing watch for user ${payload.inbox_email}`);
      await this.googleService.renewWatch(payload.inbox_email);
      this.logger.log(
        `Successfully renewed watch for user ${payload.inbox_email}`,
      );
    } catch (error) {
      this.logger.error(
        `Error renewing watch for user ${payload.inbox_email}`,
        error,
      );
    }
  }

  @RabbitSubscribe(getListening(Events.RENEW_TOKEN))
  @Public()
  async handleRenewToken(payload: { inbox_email: string }) {
    try {
      this.logger.log(`Renewing token for credential ${payload.inbox_email}`);
      await this.googleService.renewTokenByInboxEmail(payload.inbox_email);
      this.logger.log(
        `Successfully renewed token for credential ${payload.inbox_email}`,
      );
    } catch (error) {
      this.logger.error(
        `Error renewing token for credential ${payload.inbox_email}`,
        error,
      );
    }
  }
}
