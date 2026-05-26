import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHmac, timingSafeEqual } from "crypto";
import { Repository } from "typeorm";
import { LightsailService } from "../common/lightsail.service";
import { S3Service } from "../common/s3.service";
import { Connector } from "../connector/connector.entity";
import { linkedInLeadsPermission } from "../permissions/permissions";
import { decrypt } from "../util/helper-util";
import { WorkflowRunStatus } from "../workflows/dto";
import { LinkedInLead } from "../workflows/linkedin-search-outreach/linkedin-lead.entity";
import { Workflow } from "../workflows/workflow.entity";
import { WorkflowRun } from "../workflows/workflow-run.entity";
import { WorkflowService } from "../workflows/workflow.service";
import { TeamService } from "./team.service";

const TEAM_PROCESS_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
const LINKEDIN_SEARCH_OUTREACH_TYPE = "linkedin-search-outreach";
const SEARCH_STEP_NAME = "linkedin-people-search";
const LINKEDIN_USERNAME_FIELD = "LinkedIn Username";
const LINKEDIN_PASSWORD_FIELD = "LinkedIn Password";

interface BrowserUserDataAccess {
  browserUserDataKey: string;
  browserUserDataDownloadUrl?: string;
  browserUserDataUploadUrl: string;
}

interface SaveLinkedInBrowserUserDataDto {
  browserUserDataKey?: string;
}

interface TeamProcessAuthHeaders {
  teamId?: string;
  timestamp?: string;
  signature?: string;
}

export interface PendingLinkedInSearchOutreachRunDto {
  workflowRunId: string;
  workflowId: string;
  searchUrl: string;
  topic: string;
  startPage?: number;
  linkedInCredentials?: {
    username: string;
    password: string;
  };
  browserUserDataKey: string;
  browserUserDataDownloadUrl?: string;
  browserUserDataUploadUrl: string;
}

interface LinkedInSearchOutreachLeadDto {
  profileUrl: string;
  name?: string | null;
  position?: string | null;
  outreachSummary?: string | null;
  status?: LinkedInLead["status"];
  skipReason?: string | null;
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

@Injectable()
export class LinkedInSearchOutreachTeamProcessService {
  private readonly logger = new Logger(
    LinkedInSearchOutreachTeamProcessService.name,
  );

  constructor(
    private readonly teamService: TeamService,
    private readonly workflowService: WorkflowService,
    private readonly lightsailService: LightsailService,
    private readonly s3Service: S3Service,
    @InjectRepository(WorkflowRun)
    private readonly workflowRunRepo: Repository<WorkflowRun>,
    @InjectRepository(LinkedInLead)
    private readonly leadRepo: Repository<LinkedInLead>,
  ) {}

  async getRun(
    workflowRunId: string,
    headers: TeamProcessAuthHeaders,
  ): Promise<PendingLinkedInSearchOutreachRunDto> {
    const teamId = await this.assertValidTeamProcessRequest(headers);
    const run = await this.findTeamRun(workflowRunId, teamId);
    this.assertRunClaimable(run);

    const config = this.readRunConfig(run);
    if (!config) {
      throw new BadRequestException(
        "LinkedIn search outreach run is missing search URL or keywords",
      );
    }

    const browserUserData = await this.resolveBrowserUserDataAccess(
      run.workflowId,
    );

    return {
      workflowRunId: run.id,
      workflowId: run.workflowId,
      searchUrl: config.searchUrl,
      topic: config.topic,
      startPage: config.startPage,
      linkedInCredentials: await this.resolveLinkedInCredentials(
        run.workflow?.linkedConnectors,
      ),
      ...browserUserData,
    };
  }

 

  async claimRun(
    workflowRunId: string,
    headers: TeamProcessAuthHeaders,
  ): Promise<void> {
    const teamId = await this.assertValidTeamProcessRequest(headers);
    const run = await this.findTeamRun(workflowRunId, teamId);
    this.assertRunClaimable(run);

    const config = this.readRunConfig(run);
    if (!config) {
      throw new BadRequestException(
        "LinkedIn search outreach run is missing search URL or keywords",
      );
    }

    await this.workflowService.updateWorkflowRun(run.id, {
      currentStep: SEARCH_STEP_NAME,
      completedView: {
        subject: linkedInLeadsPermission.subject,
        id: run.id,
      },
      stepsContext: {
        [SEARCH_STEP_NAME]: {
          searchUrl: config.searchUrl,
          topic: config.topic,
          status: "collecting",
          claimedAt: Date.now(),
        },
      },
      updatedAt: Date.now(),
    });
  }

  async updateProgress(
    workflowRunId: string,
    body: UpdateLinkedInSearchOutreachProgressDto,
    headers: TeamProcessAuthHeaders,
  ): Promise<void> {
    const teamId = await this.assertValidTeamProcessRequest(headers);
    await this.findTeamRun(workflowRunId, teamId);

    const updates: Partial<WorkflowRun> = {
      updatedAt: Date.now(),
    };
    if (body.currentStep !== undefined) {
      updates.currentStep = body.currentStep;
    }
    if (body.stepsContext !== undefined) {
      updates.stepsContext = body.stepsContext;
    }
    if (body.displayContext !== undefined) {
      updates.displayContext = body.displayContext;
    }

    await this.workflowService.updateWorkflowRun(workflowRunId, updates);
  }

  async upsertLeads(
    workflowRunId: string,
    leads: LinkedInSearchOutreachLeadDto[] | undefined,
    headers: TeamProcessAuthHeaders,
  ): Promise<{ saved: number }> {
    const teamId = await this.assertValidTeamProcessRequest(headers);
    const run = await this.findTeamRun(workflowRunId, teamId);
    const config = this.readRunConfig(run);
    if (!config) {
      throw new BadRequestException(
        "LinkedIn search outreach run is missing search URL or keywords",
      );
    }

    const normalized = this.normalizeLeads(leads);
    if (normalized.length === 0) {
      return { saved: 0 };
    }

    const now = Date.now();
    let saved = 0;

    for (const lead of normalized) {
      const existing = await this.leadRepo.findOne({
        where: { workflowRunId, profileUrl: lead.profileUrl },
      });

      if (existing) {
        existing.name = lead.name ?? existing.name;
        existing.position = lead.position ?? existing.position;
        if (lead.outreachSummary !== undefined) {
          existing.outreachSummary = lead.outreachSummary;
        }
        if (lead.status !== undefined) {
          existing.status = lead.status;
        }
        if (lead.skipReason !== undefined) {
          existing.skipReason = lead.skipReason;
        }
        existing.updatedAt = now;
        await this.leadRepo.save(existing);
        saved += 1;
        continue;
      }

      await this.leadRepo.save(
        this.leadRepo.create({
          workflowRunId,
          searchUrl: config.searchUrl,
          profileUrl: lead.profileUrl,
          name: lead.name ?? null,
          position: lead.position ?? null,
          outreachSummary: lead.outreachSummary ?? null,
          status: lead.status ?? "pending",
          skipReason: lead.skipReason ?? null,
          createdAt: now,
          updatedAt: now,
        }),
      );
      saved += 1;
    }

    return { saved };
  }

  async completeRun(
    workflowRunId: string,
    body: CompleteLinkedInSearchOutreachRunDto,
    headers: TeamProcessAuthHeaders,
  ): Promise<void> {
    const teamId = await this.assertValidTeamProcessRequest(headers);
    const run = await this.findTeamRun(workflowRunId, teamId);

    if (body.status !== "completed" && body.status !== "failed") {
      throw new BadRequestException("status must be completed or failed");
    }

    const now = Date.now();
    const displayContext = {
      ...(run.displayContext || {}),
      ...(body.displayContext || {}),
      ...(body.status === "failed" && body.error
        ? { error: body.error, failedAt: now }
        : {}),
      ...(body.status === "completed" ? { completedAt: now } : {}),
    };

    await this.workflowService.updateWorkflowRun(workflowRunId, {
      status:
        body.status === "completed"
          ? WorkflowRunStatus.COMPLETED
          : WorkflowRunStatus.FAILED,
      displayContext,
      updatedAt: now,
    });
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    await this.deleteLightsailInstanceIfPresent(run.lightSailInstanceId);
  }

  private async deleteLightsailInstanceIfPresent(
    instanceId: string | null | undefined,
  ): Promise<void> {
    const trimmed = instanceId?.trim();
    if (!trimmed) {
      return;
    }

    try {
      await this.lightsailService.deleteInstance(trimmed);
    } catch (error) {
      this.logger.error(
        `Failed to delete Lightsail instance ${trimmed} after workflow run completion`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async resolveBrowserUserDataAccess(
    workflowId: string,
  ): Promise<BrowserUserDataAccess> {
    const browserUserDataKey = `browser-data/${workflowId}.tar.gz`;
    const browserUserDataUploadUrl = await this.s3Service.getSignedUrlForUpload(
      browserUserDataKey,
    );
    if (!browserUserDataUploadUrl) {
      throw new BadRequestException(
        "Could not create browser user data upload URL",
      );
    }

    let browserUserDataDownloadUrl: string | undefined;
    const exists = await this.s3Service.objectExists(browserUserDataKey);
    if (exists) {
      browserUserDataDownloadUrl =
        (await this.s3Service.getSignedUrlForDownload(browserUserDataKey)) ??
        undefined;
    }

    return {
      browserUserDataKey,
      browserUserDataDownloadUrl,
      browserUserDataUploadUrl,
    };
  }

  private async findTeamRun(
    workflowRunId: string,
    teamId: string,
  ): Promise<WorkflowRun> {
    const run = await this.workflowRunRepo.findOne({
      where: { id: workflowRunId },
      relations: ["workflow", "workflow.linkedConnectors"],
    });

    if (!run || run.workflow?.teamId !== teamId) {
      throw new NotFoundException("Workflow run not found");
    }
    if (run.workflow.workflowType !== LINKEDIN_SEARCH_OUTREACH_TYPE) {
      throw new BadRequestException(
        "Workflow run is not a LinkedIn search outreach run",
      );
    }

    return run;
  }

  private assertRunClaimable(run: WorkflowRun): void {
    if (run.status !== WorkflowRunStatus.PENDING) {
      throw new ConflictException("Workflow run is no longer pending");
    }
    if (run.stepsContext && Object.keys(run.stepsContext).length > 0) {
      throw new ConflictException("Workflow run is already claimed");
    }
  }

  private readRunConfig(
    run: WorkflowRun,
  ): {
    searchUrl: string;
    topic: string;
    startPage?: number;
  } | null {
    const contextSearchUrl = String(run.context?.searchUrl ?? "").trim();
    const contextTopic = String(run.context?.topic ?? "").trim();
    const contextStartPage = Number(run.context?.startPage ?? 1);
    if (contextSearchUrl && contextTopic) {
      return {
        searchUrl: contextSearchUrl,
        topic: contextTopic,
        startPage: contextStartPage,
      };
    }

    return null;
  }

  private normalizeLeads(
    leads: LinkedInSearchOutreachLeadDto[] | undefined,
  ): LinkedInSearchOutreachLeadDto[] {
    if (!Array.isArray(leads)) {
      throw new BadRequestException("leads must be an array");
    }

    const seen = new Set<string>();
    const normalized: LinkedInSearchOutreachLeadDto[] = [];

    for (const lead of leads) {
      const profileUrl = String(lead?.profileUrl ?? "").trim();
      if (!profileUrl || seen.has(profileUrl)) {
        continue;
      }
      seen.add(profileUrl);
      normalized.push({
        profileUrl,
        name: lead.name ?? null,
        position: lead.position ?? null,
        outreachSummary: lead.outreachSummary ?? null,
        status: lead.status,
        skipReason: lead.skipReason ?? null,
      });
    }

    return normalized;
  }

  private async resolveLinkedInCredentials(
    connectors: Connector[] | undefined,
  ): Promise<{ username: string; password: string } | undefined> {
    const connector = connectors?.find((c) =>
      (c.connectorTypeId || "").toLowerCase().includes("linkedin"),
    );
    if (!connector?.credentials) {
      return undefined;
    }

    const username = String(
      connector.credentials[LINKEDIN_USERNAME_FIELD] ?? "",
    ).trim();
    const encryptedPassword = connector.credentials[LINKEDIN_PASSWORD_FIELD];
    if (!username || !encryptedPassword) {
      return undefined;
    }

    try {
      const password = await decrypt(String(encryptedPassword));
      const trimmed = password?.trim();
      if (!trimmed) {
        return undefined;
      }
      return { username, password: trimmed };
    } catch {
      return undefined;
    }
  }

  private async assertValidTeamProcessRequest({
    teamId,
    timestamp,
    signature,
  }: TeamProcessAuthHeaders): Promise<string> {
    if (!teamId) {
      throw new UnauthorizedException("Missing team process team id");
    }
    if (!timestamp) {
      throw new UnauthorizedException("Missing team process timestamp");
    }
    if (!signature) {
      throw new UnauthorizedException("Missing team process signature");
    }

    const parsedTimestamp = Number(timestamp);
    const maxAgeMs = Number(
      process.env.TEAM_PROCESS_SIGNATURE_MAX_AGE_MS ??
        TEAM_PROCESS_SIGNATURE_MAX_AGE_MS,
    );
    if (
      !Number.isFinite(parsedTimestamp) ||
      Math.abs(Date.now() - parsedTimestamp) > maxAgeMs
    ) {
      throw new UnauthorizedException("Expired team process signature");
    }

    const scraperConfig = await this.teamService.getDecryptedConfigByTeamId(
      teamId,
      "scrapers",
    );
    if (!scraperConfig?.secret) {
      throw new UnauthorizedException("Team scraper secret is not configured");
    }

    const expected = createHmac("sha256", scraperConfig.secret)
      .update(`${teamId}:${timestamp}`)
      .digest("hex");
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);

    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      throw new UnauthorizedException("Invalid team process signature");
    }

    return teamId;
  }
}
