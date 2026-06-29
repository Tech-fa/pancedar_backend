import {
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserRequest } from "../../permissions/dto";
import { QueuePublisher } from "../../queue/queue.publisher";
import { LinkedInLead } from "../linkedin-search-outreach/linkedin-lead.entity";
import { WorkflowRunStatus } from "../dto";
import { WorkflowService } from "../workflow.service";
import { LinkedInOutreachService } from "../google-business-scraper/linkedin-outreach.service";
import { TriggerLinkedInCompanySearchOutreachDto } from "./dto";

const LINKEDIN_COMPANY_SEARCH_OUTREACH_TYPE = "linkedin-company-search-outreach";
const SEARCH_STEP_NAME = "linkedin-company-search";
const OUTREACH_STEP_NAME = "collect-company-outreach";

@Injectable()
export class LinkedInCompanySearchOutreachService {
  private readonly logger = new Logger(
    LinkedInCompanySearchOutreachService.name,
  );

  constructor(
    private readonly linkedInOutreach: LinkedInOutreachService,
    private readonly queuePublisher: QueuePublisher,
    private readonly workflowService: WorkflowService,
    @InjectRepository(LinkedInLead)
    private readonly leadRepo: Repository<LinkedInLead>,
  ) {}

  async runForWorkflow(
    user: UserRequest,
    body: TriggerLinkedInCompanySearchOutreachDto,
  ): Promise<void> {
    const workflow = await this.workflowService.findOne(user, body.workflowId);
    if (workflow.workflowType !== LINKEDIN_COMPANY_SEARCH_OUTREACH_TYPE) {
      throw new BadRequestException(
        "Workflow is not a LinkedIn company search outreach workflow",
      );
    }

    const searchUrl = body.searchUrl.trim();
    const selectionCriteria = body.selectionCriteria.trim();
    const messageTopic = body.messageTopic.trim();
    if (!searchUrl) {
      throw new BadRequestException("searchUrl is required");
    }
    if (!selectionCriteria.trim()) {
      throw new BadRequestException("selectionCriteria is required");
    }

    const workflowRun = await this.workflowService.createWorkflowRun({
      workflowId: workflow.id,
      context: {
        kind: LINKEDIN_COMPANY_SEARCH_OUTREACH_TYPE,
        searchUrl,
        selectionCriteria,
        messageTopic,
        startPage: body.startPage,
      },
      displayContext: {
        title: "LinkedIn company search outreach",
        searchUrl,
        selectionCriteria,
        messageTopic,
        startPage: body.startPage,
        startedAt: Date.now(),
      },
    });

    await this.workflowService.updateWorkflowRun(workflowRun.id, {
      completedView: {
        subject: "linkedin_leads",
        id: workflowRun.id,
      },
    });

    void this.runPipeline(workflowRun.id, searchUrl, selectionCriteria, messageTopic, body.startPage);
  }

  async findLeadsForTeam(
    teamId: string,
    workflowRunId?: string,
    limit = 100,
  ): Promise<LinkedInLead[]> {
    const take = Math.min(Math.max(limit, 1), 500);
    const qb = this.leadRepo
      .createQueryBuilder("lead")
      .innerJoin("lead.workflowRun", "run")
      .innerJoin("run.workflow", "workflow")
      .where("workflow.teamId = :teamId", { teamId })
      .andWhere("workflow.workflowType = :workflowType", {
        workflowType: LINKEDIN_COMPANY_SEARCH_OUTREACH_TYPE,
      });

    const trimmedRunId = workflowRunId?.trim();
    if (trimmedRunId) {
      qb.andWhere("lead.workflowRunId = :workflowRunId", {
        workflowRunId: trimmedRunId,
      });
    }

    return qb.orderBy("lead.createdAt", "DESC").take(take).getMany();
  }

  private async runPipeline(
    workflowRunId: string,
    searchUrl: string,
    selectionCriteria: string,
    messageTopic: string,
    startPage: number | undefined,
  ): Promise<void> {
    const workflowRun =
      await this.workflowService.findWorkflowRunById(workflowRunId);
    const linkedinConnector = workflowRun?.workflow?.linkedConnectors?.find(
      (c) => (c.connectorTypeId || "").toLowerCase().includes("linkedin"),
    );
    const credentials =
      await this.linkedInOutreach.credentialsFromConnector(linkedinConnector);

    await this.workflowService.updateWorkflowRun(workflowRunId, {
      currentStep: SEARCH_STEP_NAME,
      stepsContext: {
        [SEARCH_STEP_NAME]: {
          searchUrl,
          selectionCriteria,
          messageTopic,
          status: "collecting",
        },
      },
      updatedAt: Date.now(),
    });

    try {
      const { companies, skipReason } =
        await this.linkedInOutreach.collectCompaniesFromSearch(
          searchUrl,
          credentials,
          startPage ?? 1,
        );

      if (skipReason === "linkedin_auth_required") {
        throw new Error(
          "LinkedIn sign-in required; link a LinkedIn connector with valid credentials",
        );
      }

      const now = Date.now();

      if (!companies.length) {
        await this.workflowService.updateWorkflowRun(workflowRunId, {
          status: WorkflowRunStatus.COMPLETED,
          currentStep: OUTREACH_STEP_NAME,
          stepsContext: {
            [SEARCH_STEP_NAME]: {
              searchUrl,
              companiesFound: 0,
              status: "completed",
            },
            [OUTREACH_STEP_NAME]: {
              total: 0,
              processed: 0,
              status: "completed",
            },
          },
          displayContext: {
            companiesFound: 0,
            leadsProcessed: 0,
            completedAt: now,
          },
          updatedAt: now,
        });
        this.logger.log(
          `[linkedin-company-search] run ${workflowRunId}: no companies found`,
        );
        return;
      }

      await this.workflowService.updateWorkflowRun(workflowRunId, {
        currentStep: OUTREACH_STEP_NAME,
        stepsContext: {
          [SEARCH_STEP_NAME]: {
            searchUrl,
            companiesFound: companies.length,
            status: "completed",
          },
          [OUTREACH_STEP_NAME]: {
            total: companies.length,
            processed: 0,
            status: "in_progress",
          },
        },
        displayContext: {
          companiesFound: companies.length,
        },
        updatedAt: now,
      });

      for (let i = 0; i < companies.length; i++) {
        const company = companies[i];
        await this.queuePublisher.publishProcessLinkedInCompanyOutreach({
          companyLinkedInUrl: company.companyUrl,
          companyName: company.name ?? null,
          selectionCriteria,
          messageTopic,
          searchUrl,
          workflowRunId,
          isLast: i === companies.length - 1,
        });
      }

      this.logger.log(
        `[linkedin-company-search] run ${workflowRunId}: queued ${companies.length} company(ies)`,
      );
    } catch (error) {
      const now = Date.now();
      await this.workflowService.updateWorkflowRun(workflowRunId, {
        status: WorkflowRunStatus.FAILED,
        displayContext: {
          error: (error as Error).message,
          failedAt: now,
        },
        updatedAt: now,
      });
      this.logger.error(
        `[linkedin-company-search] run ${workflowRunId} failed: ${
          (error as Error).message
        }`,
        (error as Error).stack,
      );
    }
  }

  private parseKeywords(raw: string): string[] {
    return raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
