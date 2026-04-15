import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as SendGrid from '@sendgrid/mail';
import { S3Service } from './s3.service';
import { EmailType } from './dto';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  constructor(
    private readonly configService: ConfigService,
    private readonly fileService: S3Service,
  ) {
    SendGrid.setApiKey(this.configService.get<string>('SENDGRID_API_KEY'));
  }

  typeMapper = {
    [EmailType.REGISTRATION]: 'Registration',
    [EmailType.ACTIVATION]: 'Activation',
    [EmailType.NOTIFICATION]: 'Notification',
    [EmailType.CUSTOM_NOTIFICATION]: 'Notification',
    [EmailType.RESET_PASSWORD]: 'Reset Password',
    [EmailType.SURVEY]: 'Survey',
  };

  async send(
    email: string,
    type: EmailType,
    replaceString: { [key: string]: string },
    subject?: string,
  ) {
    try {
      if (process.env.NODE_ENV != 'production' ) {
        return;
      }
      if (email.includes('@@')) {
        email = email.split('@@')[1];
      }
      let html = await this.fileService.getFile(`emails/${type}.html`);
      Object.entries(replaceString).forEach(([key, value]) => {
        const reg = new RegExp(`@@${key}@@`, 'g');
        html = html.replace(reg, value);
      });
      const mail = {
        to: email,
        subject: subject || `Vigelon Ops ${this.typeMapper[type] ?? type}`,
        from: {
          email: this.configService.get('FROM_EMAIL'),
          name: 'Vigelon Ops',
        },
        html: html,
      };
      const transport = await SendGrid.send(mail);

      this.logger.log(`Email ${type} successfully dispatched to ${mail.to}`);
      return transport;
    } catch (error) {
      this.logger.error('Error occured on getting email ', error);
    }
  }
}
