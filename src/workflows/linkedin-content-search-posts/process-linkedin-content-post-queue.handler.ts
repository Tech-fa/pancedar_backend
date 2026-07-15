import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Events, getListening } from "../../queue/queue-constants";
import { RealBrowserService } from "../../resource-ingestion/real-browser";
import { Public } from "../../util/constants";
import { WorkflowRunStatus } from "../dto";
import { LinkedInOutreachService } from "../google-business-scraper/linkedin-outreach.service";
import { WorkflowService } from "../workflow.service";
import { LinkedInContentPost } from "./linkedin-content-post.entity";

export interface ProcessLinkedInContentPostQueuePayload {
  companyLinkedInUrl: string;
  companyName?: string | null;
  postContent: string;
  postKey: string;
  searchUrl: string;
  searchWord: string;
  workflowRunId: string;
  isLast?: boolean;
}

const FILTER_STEP_NAME = "filter-company-posts";

@Injectable()
export class ProcessLinkedInContentPostQueueHandler {
  private readonly logger = new Logger(
    ProcessLinkedInContentPostQueueHandler.name,
  );

  constructor(
    private readonly linkedInOutreach: LinkedInOutreachService,
    private readonly realBrowser: RealBrowserService,
    private readonly workflowService: WorkflowService,
    @InjectRepository(LinkedInContentPost)
    private readonly postRepo: Repository<LinkedInContentPost>,
  ) {}

  @RabbitSubscribe({
    ...getListening(Events.PROCESS_LINKEDIN_CONTENT_POST),
    queueOptions: {
      channel: "process-linkedin-content-post",
    },
  })
  @Public()
  async handle(
    payload: ProcessLinkedInContentPostQueuePayload,
  ): Promise<void> {
    if (!payload?.companyLinkedInUrl?.trim()) {
      this.logger.warn(
        "PROCESS_LINKEDIN_CONTENT_POST skipped: companyLinkedInUrl missing",
      );
      return;
    }
    if (!payload.workflowRunId?.trim()) {
      this.logger.warn(
        "PROCESS_LINKEDIN_CONTENT_POST skipped: workflowRunId missing",
      );
      return;
    }

    const companyUrl = payload.companyLinkedInUrl.trim();
    const workflowRunId = payload.workflowRunId.trim();
    const now = Date.now();

    this.logger.log(
      `PROCESS_LINKEDIN_CONTENT_POST started for ${companyUrl}`,
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

      let postStatus: LinkedInContentPost["status"] = "failed";
      let skipReason: string | null = null;
      let companyLocation: string | null = null;
      let postLink: string | null = null;

      try {
        const hqResult = await this.realBrowser.getLinkedInCompanyHeadquarters(
          companyUrl,
          credentials,
        );
        companyLocation = hqResult.location;
        skipReason = hqResult.skipReason ?? null;
        console.log(companyLocation);
        if (skipReason === "linkedin_auth_required") {
          postStatus = "failed";
        } else if (
          !this.realBrowser.isUsOrCanadaHeadquarters(companyLocation)
        ) {
          postStatus = "skipped";
          skipReason = skipReason ?? "company_not_in_us_or_canada";
        } else {
          const linkResult =
            await this.realBrowser.extractLinkedInContentPostLink(
              payload.searchUrl,
              companyUrl,
              payload.postContent,
              credentials,
            );
          postLink = linkResult.postLink;
          skipReason = linkResult.skipReason ?? null;

          if (postLink) {
            postStatus = "completed";
          } else {
            postStatus = "skipped";
          }
        }
      } catch (error) {
        skipReason = (error as Error).message;
        this.logger.warn(
          `PROCESS_LINKEDIN_CONTENT_POST processing failed for ${companyUrl}: ${skipReason}`,
        );
      }

      await this.savePost({
        workflowRunId,
        searchUrl: payload.searchUrl,
        searchWord: payload.searchWord,
        companyLinkedInUrl: companyUrl,
        companyName: payload.companyName ?? null,
        companyLocation,
        postContent: payload.postContent,
        postLink,
        status: postStatus,
        skipReason,
        postKey: payload.postKey,
        now,
      });

      const run = await this.workflowService.findWorkflowRunById(workflowRunId);
      const filterContext = (run?.stepsContext?.[FILTER_STEP_NAME] ?? {}) as {
        total?: number;
        processed?: number;
      };
      const processed = Number(filterContext.processed ?? 0) + 1;
      const total = Number(filterContext.total ?? processed);

      await this.workflowService.updateWorkflowRun(workflowRunId, {
        currentStep: FILTER_STEP_NAME,
        stepsContext: {
          ...(run?.stepsContext ?? {}),
          [FILTER_STEP_NAME]: {
            ...filterContext,
            total,
            processed,
            status: payload.isLast ? "completed" : "in_progress",
          },
        },
        updatedAt: now,
      });

      if (payload.isLast) {
        const savedCount = await this.postRepo.count({
          where: { workflowRunId, status: "completed" },
        });
        await this.workflowService.updateWorkflowRun(workflowRunId, {
          status: WorkflowRunStatus.COMPLETED,
          displayContext: {
            ...(run?.displayContext ?? {}),
            postsProcessed: processed,
            postsSaved: savedCount,
            completedAt: now,
          },
          updatedAt: now,
        });
        this.logger.log(
          `PROCESS_LINKEDIN_CONTENT_POST completed run ${workflowRunId}`,
        );
      }

      this.logger.log(
        `PROCESS_LINKEDIN_CONTENT_POST saved post for ${companyUrl}`,
      );
    } catch (error) {
      this.logger.error(
        `PROCESS_LINKEDIN_CONTENT_POST failed for ${companyUrl}: ${
          (error as Error).message
        }`,
        (error as Error).stack,
      );
    }
  }

  private async savePost(input: {
    workflowRunId: string;
    searchUrl: string;
    searchWord: string;
    companyLinkedInUrl: string;
    companyName: string | null;
    companyLocation: string | null;
    postContent: string;
    postLink: string | null;
    status: LinkedInContentPost["status"];
    skipReason: string | null;
    postKey: string;
    now: number;
  }): Promise<void> {
    const existing = await this.postRepo.findOne({
      where: {
        workflowRunId: input.workflowRunId,
        companyLinkedInUrl: input.companyLinkedInUrl,
        postContent: input.postContent,
      },
    });

    if (existing) {
      existing.companyName = input.companyName;
      existing.companyLocation = input.companyLocation;
      existing.postLink = input.postLink;
      existing.status = input.status;
      existing.skipReason = input.skipReason;
      existing.updatedAt = input.now;
      await this.postRepo.save(existing);
      return;
    }

    await this.postRepo.save(
      this.postRepo.create({
        workflowRunId: input.workflowRunId,
        searchUrl: input.searchUrl,
        searchWord: input.searchWord,
        companyLinkedInUrl: input.companyLinkedInUrl,
        companyName: input.companyName,
        companyLocation: input.companyLocation,
        postContent: input.postContent,
        postLink: input.postLink,
        status: input.status,
        skipReason: input.skipReason,
        createdAt: input.now,
        updatedAt: input.now,
      }),
    );
  }
}
