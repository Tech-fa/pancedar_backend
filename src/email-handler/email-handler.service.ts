import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Events, getListening } from '../queue/queue-constants';
import { EmailService } from '../common/email.service';
import { EmailType } from '../common/dto';
import { Public } from '../util/constants';
import { EmailHandlerDTO } from './dto';
@Injectable()
export class EmailHandlerService {
  private readonly logger = new Logger(EmailHandlerService.name);
  constructor(private readonly emailService: EmailService) {}


  @RabbitSubscribe(getListening(Events.EMAIL_SENDING))
  @Public()
  async handleEmailSending(data: EmailHandlerDTO) {
    try {
      await this.emailService.send(data.to, data.type, data.replaceString,data.subject);
      this.logger.log(`Email was sent successfully to ${data.to}`);
    } catch (error) {
      this.logger.error('Failed to send email:', error);
      throw error;
    }
  }
} 