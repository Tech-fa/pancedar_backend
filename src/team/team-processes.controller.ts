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
import { LinkedInSearchOutreachTeamProcessService } from "./linkedin-search-outreach-team-process.service";
import { TeamProcessingService } from "./team-processing.service";

interface ProcessKijijiLinksDto {
  links?: string[];
}

interface LinkedInSearchOutreachLeadsDto {
  leads?: Array<{
    profileUrl: string;
    name?: string | null;
    position?: string | null;
    outreachSummary?: string | null;
    status?: "pending" | "completed" | "failed" | "skipped";
    skipReason?: string | null;
  }>;
}

interface UpdateLinkedInSearchOutreachProgressDto {
  currentStep?: string;
  stepsContext?: Record<string, unknown>;
  displayContext?: Record<string, unknown>;
}

interface CompleteLinkedInSearchOutreachRunDto {
  status: "completed" | "failed";
  displayContext?: Record<string, unknown>;
  error?: string;
}

interface SaveLinkedInBrowserUserDataDto {
  browserUserDataKey?: string;
}

@Controller("team-processes")
export class TeamProcessesController {
  constructor(
    private readonly teamProcessingService: TeamProcessingService,
    private readonly linkedInSearchOutreachTeamProcessService: LinkedInSearchOutreachTeamProcessService,
  ) {}

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

  @Get("linkedin-search-outreach/:workflowRunId")
  @Public()
  async getLinkedInSearchOutreachRun(
    @Param("workflowRunId") workflowRunId: string,
    @Headers("x-team-id") teamId: string,
    @Headers("x-team-process-timestamp") timestamp: string,
    @Headers("x-team-process-signature") signature: string,
  ) {
    return this.linkedInSearchOutreachTeamProcessService.getRun(workflowRunId, {
      teamId,
      timestamp,
      signature,
    });
  }

  @Post("linkedin-search-outreach/:workflowRunId/claim")
  @Public()
  async claimLinkedInSearchOutreachRun(
    @Param("workflowRunId") workflowRunId: string,
    @Headers("x-team-id") teamId: string,
    @Headers("x-team-process-timestamp") timestamp: string,
    @Headers("x-team-process-signature") signature: string,
  ) {
    return this.linkedInSearchOutreachTeamProcessService.claimRun(
      workflowRunId,
      {
        teamId,
        timestamp,
        signature,
      },
    );
  }

  @Post("linkedin-search-outreach/:workflowRunId/progress")
  @Public()
  async updateLinkedInSearchOutreachProgress(
    @Param("workflowRunId") workflowRunId: string,
    @Body() body: UpdateLinkedInSearchOutreachProgressDto,
    @Headers("x-team-id") teamId: string,
    @Headers("x-team-process-timestamp") timestamp: string,
    @Headers("x-team-process-signature") signature: string,
  ) {
    return this.linkedInSearchOutreachTeamProcessService.updateProgress(
      workflowRunId,
      body,
      {
        teamId,
        timestamp,
        signature,
      },
    );
  }

  @Post("linkedin-search-outreach/:workflowRunId/leads")
  @Public()
  async upsertLinkedInSearchOutreachLeads(
    @Param("workflowRunId") workflowRunId: string,
    @Body() body: LinkedInSearchOutreachLeadsDto,
    @Headers("x-team-id") teamId: string,
    @Headers("x-team-process-timestamp") timestamp: string,
    @Headers("x-team-process-signature") signature: string,
  ) {
    return this.linkedInSearchOutreachTeamProcessService.upsertLeads(
      workflowRunId,
      body.leads,
      {
        teamId,
        timestamp,
        signature,
      },
    );
  }

  @Post("linkedin-search-outreach/:workflowRunId/complete")
  @Public()
  async completeLinkedInSearchOutreachRun(
    @Param("workflowRunId") workflowRunId: string,
    @Body() body: CompleteLinkedInSearchOutreachRunDto,
    @Headers("x-team-id") teamId: string,
    @Headers("x-team-process-timestamp") timestamp: string,
    @Headers("x-team-process-signature") signature: string,
  ) {
    return this.linkedInSearchOutreachTeamProcessService.completeRun(
      workflowRunId,
      body,
      {
        teamId,
        timestamp,
        signature,
      },
    );
  }
}
