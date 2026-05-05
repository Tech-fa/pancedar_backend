import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class RegisterChatWidgetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  appName: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sessionId?: string;
}

export class InitChatWidgetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  appName: string;
}

export class ChatWidgetMessagesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  perPage: number = 10;
}

export type RegisterChatWidgetResponse = {
  runId: string;
  websocketUrl: string;
  greetingMessage: string;
};

export type InitChatWidgetResponse = {
  colorTheme: string;
  chatIcon: string;
  hideCircle: boolean;
  assistantName: string;
  assistantIcon: string;
};
