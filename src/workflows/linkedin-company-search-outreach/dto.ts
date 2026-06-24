import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";

export class TriggerLinkedInCompanySearchOutreachDto {
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
