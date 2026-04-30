import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendWhatsAppMessageDto {
  @IsString()
  @IsNotEmpty()
  to: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsBoolean()
  previewUrl?: boolean;
}
