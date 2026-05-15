import { IsNotEmpty, IsString, IsUUID } from "class-validator";

export class TriggerGoogleBusinessScrapeDto {
  @IsUUID()
  workflowId: string;
}
