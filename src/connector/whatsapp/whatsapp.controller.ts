import { Body, Controller, Logger, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import { formatResponse } from 'src/util/helper-util';
import { SendWhatsAppMessageDto } from './dto';
import { WhatsAppService } from './whatsapp.service';

@Controller('connector/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private readonly whatsAppService: WhatsAppService) {}

  @Post(':connectorId/messages')
  async sendMessage(
    @Res() res: Response,
    @Param('connectorId') connectorId: string,
    @Body() body: SendWhatsAppMessageDto,
  ) {
    return formatResponse(
      this.logger,
      this.whatsAppService.sendTextMessage(connectorId, body),
      res,
      'sending WhatsApp message',
    );
  }
}
