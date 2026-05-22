import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserRequest } from "../../permissions/dto";
import { linkedInLeadsPermission } from "../../permissions/permissions";
import {
  LinkedInPersonProfile,
  RealBrowserService,
} from "../../resource-ingestion/real-browser";
import { WorkflowRunStatus } from "../dto";
import { Workflow } from "../workflow.entity";
import { WorkflowRun } from "../workflow-run.entity";
import { WorkflowService } from "../workflow.service";
import { LinkedInOutreachService } from "../google-business-scraper/linkedin-outreach.service";
import { LinkedInLead } from "./linkedin-lead.entity";

const LINKEDIN_SEARCH_OUTREACH_TYPE = "linkedin-search-outreach";
const SEARCH_STEP_NAME = "linkedin-people-search";

@Injectable()
export class LinkedInSearchOutreachService {
  private readonly logger = new Logger(LinkedInSearchOutreachService.name);

  constructor(
    private readonly realBrowser: RealBrowserService,
    private readonly linkedInOutreach: LinkedInOutreachService,
    private readonly workflowService: WorkflowService,
    @InjectRepository(LinkedInLead)
    private readonly leadRepo: Repository<LinkedInLead>,
  ) {}

  async runForWorkflow(user: UserRequest, workflowId: string): Promise<void> {
    const workflow = await this.workflowService.findOne(user, workflowId);
    if (workflow.workflowType !== LINKEDIN_SEARCH_OUTREACH_TYPE) {
      throw new BadRequestException(
        "Workflow is not a LinkedIn search outreach workflow",
      );
    }

    const { searchUrl, keywords } = this.readStepConfig(workflow);
    const workflowRun = await this.workflowService.createWorkflowRun({
      workflowId: workflow.id,
      context: { kind: LINKEDIN_SEARCH_OUTREACH_TYPE, searchUrl, keywords },
      displayContext: {
        title: "LinkedIn search outreach",
        searchUrl,
        keywords,
        startedAt: Date.now(),
      },
    });

    await this.workflowService.updateWorkflowRun(workflowRun.id, {
      completedView: {
        subject: linkedInLeadsPermission.subject,
        id: workflowRun.id,
      },
      currentStep: SEARCH_STEP_NAME,
    });

    void this.executePipeline(
      user,
      workflow,
      workflowRun,
      searchUrl,
      keywords,
    ).catch((err) => {
      this.logger.error(
        `[linkedin-search-outreach] run ${workflowRun.id} failed: ${
          (err as Error).message
        }`,
        (err as Error).stack,
      );
    });
  }

  async findLeadsForTeam(
    teamId: string,
    workflowRunId?: string,
    limit = 100,
  ): Promise<LinkedInLead[]> {
    const take = Math.min(Math.max(limit, 1), 500);
    const where = workflowRunId?.trim()
      ? { teamId, workflowRunId: workflowRunId.trim() }
      : { teamId };

    return await this.leadRepo.find({
      where,
      order: { createdAt: "DESC" },
      take,
    });
  }

  private readStepConfig(
    workflow: Workflow,
  ): {
    searchUrl: string;
    keywords: string[];
  } {
    const step = workflow.steps?.find((s) => s.name === SEARCH_STEP_NAME);
    const searchUrl = String(step?.values?.searchUrl ?? "").trim();
    const keywords = this.parseKeywords(step?.values?.keywords);

    if (!searchUrl) {
      throw new BadRequestException(
        `Configure "LinkedIn search URL" in workflow step "${SEARCH_STEP_NAME}"`,
      );
    }
    if (!keywords.length) {
      throw new BadRequestException(
        `Configure "Keywords" in workflow step "${SEARCH_STEP_NAME}"`,
      );
    }

    return { searchUrl, keywords };
  }

  private async executePipeline(
    user: UserRequest,
    workflow: Workflow,
    workflowRun: WorkflowRun,
    searchUrl: string,
    keywords: string[],
  ): Promise<void> {
    const credentials = await this.resolveLinkedInCredentials(workflow);

    try {
      await this.workflowService.updateWorkflowRun(workflowRun.id, {
        currentStep: SEARCH_STEP_NAME,
        stepsContext: {
          [SEARCH_STEP_NAME]: { searchUrl, keywords, status: "collecting" },
        },
      });

      const scrapeResult = await this.realBrowser.collectLinkedInSearchPeopleProfileUrls(
        searchUrl,
        10,
        credentials,
      );

      if (scrapeResult.skipReason === "linkedin_auth_required") {
        throw new BadRequestException(
          "LinkedIn sign-in required; link a LinkedIn connector with valid credentials",
        );
      }

      const profiles = scrapeResult.profiles ?? [];
      const now = Date.now();
      const leads = await this.saveLeads(
        workflowRun.id,
        searchUrl,
        profiles,
        now,
      );

      await this.workflowService.updateWorkflowRun(workflowRun.id, {
        currentStep: "collect-profile-outreach",
        stepsContext: {
          [SEARCH_STEP_NAME]: {
            searchUrl,
            keywords,
            profilesFound: profiles.length,
            status: "completed",
          },
          "collect-profile-outreach": {
            total: leads.length,
            processed: 0,
            status: "in_progress",
          },
        },
        displayContext: {
          ...(workflowRun.displayContext || {}),
          profilesFound: profiles.length,
        },
      });

      let processed = 0;
      const browser = await this.realBrowser.launchBrowser();
      for (const lead of leads) {
        const profile: LinkedInPersonProfile = {
          name: lead.name || "LinkedIn member",
          position: lead.position || "",
          profileUrl: lead.profileUrl,
        };

        try {
          const outreach = await this.linkedInOutreach.runOutreachForProfile(
            profile,
            keywords,
            credentials,
            browser,
          );
          lead.outreachSummary = outreach.linkedinOutreachSummary;
          lead.status = outreach.linkedinOutreachSummary
            ? "completed"
            : "skipped";
          lead.skipReason = outreach.skipReason ?? null;
        } catch (err) {
          lead.status = "failed";
          lead.skipReason = (err as Error).message;
          this.logger.warn(
            `[linkedin-search-outreach] outreach failed for ${lead.profileUrl}: ${lead.skipReason}`,
          );
        }

        lead.updatedAt = Date.now();
        await this.leadRepo.save(lead);
        processed += 1;

        await this.workflowService.updateWorkflowRun(workflowRun.id, {
          stepsContext: {
            [SEARCH_STEP_NAME]: {
              searchUrl,
              keywords,
              profilesFound: profiles.length,
              status: "completed",
            },
            "collect-profile-outreach": {
              total: leads.length,
              processed,
              status: processed >= leads.length ? "completed" : "in_progress",
            },
          },
        });

        await this.humanDelayBetweenProfiles();
      }

      const completedAt = Date.now();
      await this.workflowService.updateWorkflowRun(workflowRun.id, {
        status: WorkflowRunStatus.COMPLETED,
        displayContext: {
          ...(workflowRun.displayContext || {}),
          profilesFound: profiles.length,
          leadsProcessed: processed,
          completedAt,
        },
        updatedAt: completedAt,
      });

      this.logger.log(
        `[linkedin-search-outreach] run ${workflowRun.id}: ${processed} lead(s) processed`,
      );
    } catch (error) {
      const now = Date.now();
      await this.workflowService.updateWorkflowRun(workflowRun.id, {
        status: WorkflowRunStatus.FAILED,
        displayContext: {
          ...(workflowRun.displayContext || {}),
          error: (error as Error).message,
          failedAt: now,
        },
        updatedAt: now,
      });
      throw error;
    }
  }

  private async saveLeads(
    workflowRunId: string,
    searchUrl: string,
    profiles: LinkedInPersonProfile[],
    now: number,
  ): Promise<LinkedInLead[]> {
    const leads: LinkedInLead[] = [];
    for (const profile of profiles) {
      const existing = await this.leadRepo.findOne({
        where: { workflowRunId, profileUrl: profile.profileUrl },
      });
      if (existing) {
        existing.name = profile.name || existing.name;
        existing.position = profile.position || existing.position;
        existing.updatedAt = now;
        leads.push(await this.leadRepo.save(existing));
        continue;
      }

      leads.push(
        await this.leadRepo.save(
          this.leadRepo.create({
            workflowRunId,
            searchUrl,
            profileUrl: profile.profileUrl,
            name: profile.name || null,
            position: profile.position || null,
            status: "pending",
            createdAt: now,
            updatedAt: now,
          }),
        ),
      );
    }
    return leads;
  }

  private async resolveLinkedInCredentials(workflow: Workflow) {
    const linkedinConnector = workflow.linkedConnectors?.find((c) =>
      (c.connectorTypeId || "").toLowerCase().includes("linkedin"),
    );
    return this.linkedInOutreach.credentialsFromConnector(linkedinConnector);
  }

  private parseKeywords(raw: unknown): string[] {
    if (Array.isArray(raw)) {
      return raw
        .map(String)
        .flatMap((s) => s.split(/[\n,]+/))
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof raw !== "string") {
      return [];
    }
    return raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private async humanDelayBetweenProfiles(): Promise<void> {
    const minMs = 2500;
    const maxMs = 5500;
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
