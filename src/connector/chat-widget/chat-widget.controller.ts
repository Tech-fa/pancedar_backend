import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from 'src/util/constants';
import { ChatWidgetService } from './chat-widget.service';
import {
  ActionPerformedChatWidgetDto,
  ChatWidgetMessagesQueryDto,
  InitChatWidgetDto,
  InitChatWidgetResponse,
  RegisterChatWidgetDto,
  RegisterChatWidgetResponse,
} from './dto';
import { ChatMessageEntity } from './chat-message.entity';
import { PaginatedResponse } from 'src/common/pagination.dto';

@Public()
@Controller('connector/chat-widget')
export class ChatWidgetController {
  constructor(private readonly chatWidgetService: ChatWidgetService) {}

  @Post('init')
  async init(
    @Body() dto: InitChatWidgetDto,
  ): Promise<InitChatWidgetResponse> {
    return this.chatWidgetService.initWidget(dto);
  }

  @Post('register')
  async registerChat(
    @Body() dto: RegisterChatWidgetDto,
    @Headers('x-chat-widget-signature') signature: string,
    @Headers('x-chat-widget-timestamp') timestamp: string,
  ): Promise<RegisterChatWidgetResponse> {
    return this.chatWidgetService.registerChat(dto, {
      signature,
      timestamp,
    });
  }
  @Post('action-performed')
  async actionPerformed(
    @Body() dto: ActionPerformedChatWidgetDto,
    @Headers('x-chat-widget-signature') signature: string,
    @Headers('x-chat-widget-timestamp') timestamp: string,
  ): Promise<RegisterChatWidgetResponse> {
    return this.chatWidgetService.registerChat(dto, {
      signature,
      timestamp,
    });
  }

  @Get('runs/:runId/messages')
  async messages(
    @Param('runId') runId: string,
    @Query() query: ChatWidgetMessagesQueryDto,
  ): Promise<PaginatedResponse<ChatMessageEntity>> {
    return this.chatWidgetService.findMessages(runId, query);
  }
}
