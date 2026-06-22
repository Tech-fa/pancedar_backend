import {
  IsOptional,
  IsNotEmpty,
  IsString,
  IsUUID,
  IsNumber,
  MinLength,
} from 'class-validator';

export class TriggerLinkedInSearchOutreachDto {
  @IsUUID()
  workflowId: string;

  @IsString()
  @IsNotEmpty()
  searchUrl: string;

  @IsString()
  @IsNotEmpty()
  topic: string;

  @IsOptional()
  @IsNumber()
  startPage?: number;
}

