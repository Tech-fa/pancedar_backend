import { Type } from "class-transformer";
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";

export class TriggerGoogleBusinessScrapeDto {
  @IsUUID()
  workflowId: string;
}

export class LinkedInOutreachCredentialsDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class TestLinkedInOutreachDto {
  @IsString()
  @IsNotEmpty()
  companyLinkedInUrl: string;

  @IsArray()
  @IsString({ each: true })
  keywords: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => LinkedInOutreachCredentialsDto)
  credentials?: LinkedInOutreachCredentialsDto;
}
