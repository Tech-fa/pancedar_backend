import { IsUUID } from "class-validator";

export class TriggerLinkedInSearchOutreachDto {
  @IsUUID()
  workflowId: string;
}
