import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Events, getListening } from "../../queue/queue-constants";
import { Public } from "../../util/constants";
import { WorkflowRunStatus } from "../dto";
import { LinkedInOutreachService } from "../google-business-scraper/linkedin-outreach.service";
import { LinkedInLead } from "../linkedin-search-outreach/linkedin-lead.entity";
import { WorkflowService } from "../workflow.service";

export interface ProcessLinkedInCompanyOutreachQueuePayload {
  companyLinkedInUrl: string;
  companyName?: string | null;
  selectionCriteria: string;
  messageTopic: string;
  searchUrl: string;
  workflowRunId: string;
  isLast?: boolean;
}

const OUTREACH_STEP_NAME = "collect-company-outreach";

@Injectable()
export class ProcessLinkedInCompanyOutreachQueueHandler {
  private readonly logger = new Logger(
    ProcessLinkedInCompanyOutreachQueueHandler.name,
  );

  constructor(
    private readonly linkedInOutreach: LinkedInOutreachService,
    private readonly workflowService: WorkflowService,
    @InjectRepository(LinkedInLead)
    private readonly leadRepo: Repository<LinkedInLead>,
  ) {}

  @RabbitSubscribe({
    ...getListening(Events.PROCESS_LINKEDIN_COMPANY_OUTREACH),
    queueOptions: {
      channel: "process-linkedin-company-outreach",
    },
  })
  @Public()
  async handle(
    payload: ProcessLinkedInCompanyOutreachQueuePayload,
  ): Promise<void> {
    if (!payload?.companyLinkedInUrl?.trim()) {
      this.logger.warn(
        "PROCESS_LINKEDIN_COMPANY_OUTREACH skipped: companyLinkedInUrl missing",
      );
      return;
    }
    if (!payload.workflowRunId?.trim()) {
      this.logger.warn(
        "PROCESS_LINKEDIN_COMPANY_OUTREACH skipped: workflowRunId missing",
      );
      return;
    }
    if (!payload.selectionCriteria?.trim()) {
      this.logger.warn(
        "PROCESS_LINKEDIN_COMPANY_OUTREACH skipped: keywords missing",
      );
      return;
    }

    const companyUrl = payload.companyLinkedInUrl.trim();
    const workflowRunId = payload.workflowRunId.trim();
    const now = Date.now();

    this.logger.log(
      `PROCESS_LINKEDIN_COMPANY_OUTREACH started for ${companyUrl}`,
    );

    try {
      const workflowRun =
        await this.workflowService.findWorkflowRunById(workflowRunId);
      const linkedinConnector =
        workflowRun?.workflow?.linkedConnectors?.find((c) =>
          (c.connectorTypeId || "").toLowerCase().includes("linkedin"),
        );
      const credentials =
        await this.linkedInOutreach.credentialsFromConnector(linkedinConnector);

      let leadStatus: LinkedInLead["status"] = "failed";
      let skipReason: string | null = null;
      let profileUrl = companyUrl;
      let name: string | null = null;
      let position: string | null = null;
      let outreachSummary: string | null = null;

      try {
        const outreach = await this.linkedInOutreach.runOutreach(
          companyUrl,
          payload.selectionCriteria,
          payload.messageTopic,
          credentials,
        );

        profileUrl = outreach.linkedinContactProfileUrl ?? companyUrl;
        name = outreach.contactName ?? null;
        position = outreach.contactPosition ?? null;
        outreachSummary = outreach.linkedinOutreachSummary;
        skipReason = outreach.skipReason ?? null;

        if (
          outreach.linkedinOutreachSummary &&
          outreach.linkedinContactProfileUrl
        ) {
          leadStatus = "completed";
        } else {
          leadStatus = "skipped";
        }
      } catch (error) {
        skipReason = (error as Error).message;
        this.logger.warn(
          `PROCESS_LINKEDIN_COMPANY_OUTREACH outreach failed for ${companyUrl}: ${skipReason}`,
        );
      }

      await this.saveLead({
        workflowRunId,
        searchUrl: payload.searchUrl,
        companyLinkedInUrl: companyUrl,
        companyName: payload.companyName ?? null,
        profileUrl,
        name,
        position,
        outreachSummary,
        status: leadStatus,
        skipReason,
        now,
      });

      const run = await this.workflowService.findWorkflowRunById(workflowRunId);
      const outreachContext = (run?.stepsContext?.[OUTREACH_STEP_NAME] ?? {}) as {
        total?: number;
        processed?: number;
      };
      const processed = Number(outreachContext.processed ?? 0) + 1;
      const total = Number(outreachContext.total ?? processed);

      await this.workflowService.updateWorkflowRun(workflowRunId, {
        currentStep: OUTREACH_STEP_NAME,
        stepsContext: {
          ...(run?.stepsContext ?? {}),
          [OUTREACH_STEP_NAME]: {
            ...outreachContext,
            total,
            processed,
            status: payload.isLast ? "completed" : "in_progress",
          },
        },
        updatedAt: now,
      });

      if (payload.isLast) {
        await this.workflowService.updateWorkflowRun(workflowRunId, {
          status: WorkflowRunStatus.COMPLETED,
          displayContext: {
            ...(run?.displayContext ?? {}),
            leadsProcessed: processed,
            completedAt: now,
          },
          updatedAt: now,
        });
        this.logger.log(
          `PROCESS_LINKEDIN_COMPANY_OUTREACH completed run ${workflowRunId}`,
        );
      }

      this.logger.log(
        `PROCESS_LINKEDIN_COMPANY_OUTREACH saved lead for ${companyUrl}`,
      );
    } catch (error) {
      this.logger.error(
        `PROCESS_LINKEDIN_COMPANY_OUTREACH failed for ${companyUrl}: ${
          (error as Error).message
        }`,
        (error as Error).stack,
      );
    }
  }

  private async saveLead(input: {
    workflowRunId: string;
    searchUrl: string;
    companyLinkedInUrl: string;
    companyName: string | null;
    profileUrl: string;
    name: string | null;
    position: string | null;
    outreachSummary: string | null;
    status: LinkedInLead["status"];
    skipReason: string | null;
    now: number;
  }): Promise<void> {
    const existing = await this.leadRepo.findOne({
      where: {
        workflowRunId: input.workflowRunId,
        companyLinkedInUrl: input.companyLinkedInUrl,
      },
    });

    if (existing) {
      existing.profileUrl = input.profileUrl;
      existing.name = input.name;
      existing.position = input.position;
      existing.companyName = input.companyName;
      existing.outreachSummary = input.outreachSummary;
      existing.status = input.status;
      existing.skipReason = input.skipReason;
      existing.updatedAt = input.now;
      await this.leadRepo.save(existing);
      return;
    }

    await this.leadRepo.save(
      this.leadRepo.create({
        workflowRunId: input.workflowRunId,
        searchUrl: input.searchUrl,
        companyLinkedInUrl: input.companyLinkedInUrl,
        companyName: input.companyName,
        profileUrl: input.profileUrl,
        name: input.name,
        position: input.position,
        outreachSummary: input.outreachSummary,
        status: input.status,
        skipReason: input.skipReason,
        createdAt: input.now,
        updatedAt: input.now,
      }),
    );
  }
}
