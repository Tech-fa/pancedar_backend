import { IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class TriggerSeoHelperRunDto {
  @IsUUID()
  workflowId: string;
}

export class ApproveSeoBlogDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  blogContent?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  linkedinContent?: string;
}

export class UpdateSeoBlogDraftDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  blogContent?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  linkedinContent?: string;
}
