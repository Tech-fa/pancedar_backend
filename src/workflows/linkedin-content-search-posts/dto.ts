import { IsNotEmpty, IsString, IsUUID } from "class-validator";

export class TriggerLinkedInContentSearchPostsDto {
  @IsUUID()
  workflowId: string;

  @IsString()
  @IsNotEmpty()
  searchWord: string;
}
