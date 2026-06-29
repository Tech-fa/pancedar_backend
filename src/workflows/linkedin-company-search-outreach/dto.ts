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
  selectionCriteria: string;

  @IsString()
  @IsNotEmpty()
  messageTopic: string;

  @IsOptional()
  @IsNumber()
  startPage?: number;
}
