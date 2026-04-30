import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { ConnectorService } from '../connector.service';
import { Connector } from '../connector.entity';
import { SendWhatsAppMessageDto } from './dto';
import { decrypt } from 'src/util/helper-util';

export const WHATSAPP_BUSINESS_NUMBER_FIELD = 'WhatsApp Business Number';
export const WHATSAPP_PHONE_NUMBER_ID_FIELD = 'WhatsApp Phone Number ID';
export const WHATSAPP_ACCESS_TOKEN_FIELD = 'WhatsApp Access Token';

interface WhatsAppMessageResponse {
  messaging_product?: string;
  contacts?: Array<{
    input: string;
    wa_id: string;
  }>;
  messages?: Array<{
    id: string;
    message_status?: string;
  }>;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly connectorService: ConnectorService,
  ) {}

  async sendTextMessage(
    connectorId: string,
    dto: SendWhatsAppMessageDto,
  ): Promise<{
    messageId: string;
    status?: string;
    to: string;
    from: string;
  }> {
    const connector = await this.connectorService.findOneById(connectorId);
    this.assertWhatsAppConnector(connector);

    const phoneNumberId = this.getCredential(
      connector,
      WHATSAPP_PHONE_NUMBER_ID_FIELD,
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    const accessToken = await this.getAccessToken(connector);
    const to = this.normalizePhoneNumber(dto.to);

    try {
      const { data } = await axios.post<WhatsAppMessageResponse>(
        `${this.graphApiBaseUrl()}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: {
            body: dto.message,
            preview_url: dto.previewUrl ?? false,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const message = data.messages?.[0];
      if (!message?.id) {
        throw new BadRequestException('WhatsApp message was not accepted');
      }

      return {
        messageId: message.id,
        status: message.message_status,
        to,
        from:
          connector.credentials?.[WHATSAPP_BUSINESS_NUMBER_FIELD] ??
          connector.primaryIdentifier,
      };
    } catch (error) {
      this.logger.error('WhatsApp send message failed', {
        message: error.message,
        stack: error.stack,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new BadRequestException(
        error.response?.data?.error?.message ??
          error.message ??
          'WhatsApp send message failed',
      );
    }
  }

  private assertWhatsAppConnector(connector: Connector): void {
    if (
      connector.connectorTypeId !== 'WhatsApp' &&
      connector.name !== 'WhatsApp'
    ) {
      throw new BadRequestException('Connector is not a WhatsApp connector');
    }
  }

  private graphApiBaseUrl(): string {
    const version = this.config.get<string>('WHATSAPP_API_VERSION') || 'v21.0';
    return `https://graph.facebook.com/${version}`;
  }

  private getCredential(
    connector: Connector,
    credentialName: string,
    envName: string,
  ): string {
    const value =
      connector.credentials?.[credentialName] ??
      this.config.get<string>(envName);
    if (!value?.trim()) {
      throw new BadRequestException(`${credentialName} is not configured`);
    }
    return value.trim();
  }

  private async getAccessToken(connector: Connector): Promise<string> {
    const encryptedToken = connector.credentials?.[WHATSAPP_ACCESS_TOKEN_FIELD];
    if (encryptedToken?.trim()) {
      return decrypt(encryptedToken);
    }

    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    if (!token?.trim()) {
      throw new BadRequestException(
        `${WHATSAPP_ACCESS_TOKEN_FIELD} is not configured`,
      );
    }
    return token.trim();
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    const normalized = phoneNumber
      .replace(/^whatsapp:/i, '')
      .replace(/\s+/g, '');
    if (!/^\+?[1-9]\d{6,14}$/.test(normalized)) {
      throw new BadRequestException(
        'Recipient phone number must be in E.164 format',
      );
    }
    return normalized.replace(/^\+/, '');
  }
}
