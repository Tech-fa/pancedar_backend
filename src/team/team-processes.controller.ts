import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { Public } from "../util/constants";
import { TeamProcessingService } from "./team-processing.service";

interface ProcessKijijiLinksDto {
  links?: string[];
}

@Controller("team-processes")
export class TeamProcessesController {
  constructor(private readonly teamProcessingService: TeamProcessingService) {}

  @Get("link-tracking/workflows")
  @Public()
  async getLinkTrackingWorkflows(
    @Headers("x-team-id") teamId: string,
    @Headers("x-team-process-timestamp") timestamp: string,
    @Headers("x-team-process-signature") signature: string,
    @Query("type") type: string,
  ) {
    return this.teamProcessingService.getLinkTrackingWorkflows(
      {
        teamId,
        timestamp,
        signature,
      },
      type,
    );
  }

  @Post("link-tracking/:workflowId/links")
  @Public()
  async processLinks(
    @Param("workflowId") workflowId: string,
    @Body() body: ProcessKijijiLinksDto,
    @Headers("x-team-id") teamId: string,
    @Headers("x-team-process-timestamp") timestamp: string,
    @Headers("x-team-process-signature") signature: string,
  ) {
    return this.teamProcessingService.processLinks(workflowId, body, {
      teamId,
      timestamp,
      signature,
    });
  }
}
