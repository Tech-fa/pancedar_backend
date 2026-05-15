import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { In, IsNull, Repository } from "typeorm";
import { UserRequest } from "../../permissions/dto";
import { QueuePublisher } from "../../queue/queue.publisher";
import { RealBrowserService } from "../../resource-ingestion/real-browser";
import { WorkflowRunStatus } from "../dto";
import { WorkflowService } from "../workflow.service";
import { GoogleFlaggedPage } from "./google-flagged-page.entity";
import { GoogleRootWebsite } from "./google-root-website.entity";
import { Workflow } from "../workflow.entity";
import { WorkflowRun } from "../workflow-run.entity";

const GOOGLE_BUSINESS_SCRAPER_TYPE = "google-business-scraper";
const SCRAPER_STEP_NAME = "scrape-google-businesses";

/** Public contact rollup for one scraped site root (maps run). */
export type GoogleRootWebsiteSummaryDto = Pick<
  GoogleRootWebsite,
  | "id"
  | "websiteUrl"
  | "googleMapsSearchUrl"
  | "phones"
  | "emails"
  | "linkedinUrl"
  | "createdAt"
  | "updatedAt"
>;

export interface GoogleFlaggedPagesGroupDto {
  rootWebsite: GoogleRootWebsiteSummaryDto | null;
  pages: GoogleFlaggedPage[];
}

@Injectable()
export class GoogleBusinessScraperService {
  private readonly logger = new Logger(GoogleBusinessScraperService.name);

  constructor(
    private readonly realBrowser: RealBrowserService,
    private readonly queuePublisher: QueuePublisher,
    private readonly workflowService: WorkflowService,
    @InjectRepository(GoogleFlaggedPage)
    private readonly flaggedRepo: Repository<GoogleFlaggedPage>,
    @InjectRepository(GoogleRootWebsite)
    private readonly rootRepo: Repository<GoogleRootWebsite>,
  ) {}

  /**
   * Loads Maps URL and keywords from the workflow step, creates a workflow run,
   * streams each discovered website to `PROCESS_WEBSITE`, then marks the run completed.
   */
  async runScrapeForWorkflow(
    user: UserRequest,
    workflowId: string,
  ): Promise<void> {
    const workflow = await this.workflowService.findByIdForTeam(
      workflowId,
      user.teamId,
    );
    if (workflow.workflowType !== GOOGLE_BUSINESS_SCRAPER_TYPE) {
      throw new BadRequestException(
        "Workflow is not a Google Business scraper workflow",
      );
    }

    const step = workflow.steps?.find((s) => s.name === SCRAPER_STEP_NAME);
    const googleMapsUrl = String(step?.values?.googleMapsUrl ?? "").trim();
    const keywords = this.parseKeywords(step?.values?.keywords);
    if (!googleMapsUrl) {
      throw new BadRequestException(
        `Configure "Google Maps URL" in workflow step "${SCRAPER_STEP_NAME}"`,
      );
    }
    if (!keywords.length) {
      throw new BadRequestException(
        `Configure "Keywords" in workflow step "${SCRAPER_STEP_NAME}"`,
      );
    }

    const normalizedKeywords = keywords.map((k) => k.trim()).filter(Boolean);
    const runNonce = randomUUID();
    const workflowRun = await this.workflowService.createWorkflowRun({
      workflowId: workflow.id,
      context: { runNonce, kind: GOOGLE_BUSINESS_SCRAPER_TYPE },
      displayContext: {
        title: "Google Business scrape",
        googleMapsUrl,
        keywords: normalizedKeywords,
        startedAt: Date.now(),
      },
    });
    await this.workflowService.updateWorkflowRun(workflowRun.id, {
      completedView: {
        subject: "flagged_pages",
        id: workflowRun.id,
      },
    });
    this.runWorkflow(
      user,
      workflow,
      workflowRun,
      googleMapsUrl,
      normalizedKeywords,
    );
  }

  private async runWorkflow(
    user: UserRequest,
    workflow: Workflow,
    workflowRun: WorkflowRun,
    googleMapsUrl: string,
    normalizedKeywords: string[],
  ): Promise<void> {
    try {
      const websiteUrls = await this.realBrowser.scrapeGoogleMapsBusinessWebsiteLinks(
        googleMapsUrl,
        async (link, isLast) => {
          await this.queuePublisher.publishProcessWebsite({
            websiteUrl: link,
            keywords: normalizedKeywords,
            googleMapsSearchUrl: googleMapsUrl,
            teamId: user.teamId,
            workflowRunId: workflowRun.id,
            isLast,
          });
        },
      );

      const now = Date.now();

      this.logger.log(
        `[google-business-scraper] run ${workflowRun.id}: queued ${websiteUrls.length} site(s)`,
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

  async findFlaggedPagesForTeam(
    teamId: string,
    limit = 100,
    workflowRunId?: string,
  ): Promise<GoogleFlaggedPagesGroupDto[]> {
    const take = Math.min(Math.max(limit, 1), 500);
    const trimmedRunId = workflowRunId?.trim();
    const rootWhere = trimmedRunId
      ? { teamId, workflowRunId: trimmedRunId }
      : { teamId };

    const roots = await this.rootRepo.find({
      where: rootWhere,
      order: { createdAt: "DESC" },
    });

    if (!roots.length) {
      const fallbackWhere = trimmedRunId
        ? { teamId, workflowRunId: trimmedRunId }
        : { teamId };
      const pages = await this.flaggedRepo.find({
        where: fallbackWhere,
        order: { createdAt: "DESC" },
        take,
      });
      return pages.length ? [{ rootWebsite: null, pages }] : [];
    }

    const rootIds = roots.map((r) => r.id);

    type PageWhereClause =
      | { teamId: string; googleRootWebsiteId: ReturnType<typeof In> }
      | {
          teamId: string;
          workflowRunId: string;
          googleRootWebsiteId: ReturnType<typeof IsNull>;
        };

    const pageWhereClauses: PageWhereClause[] = [
      { teamId, googleRootWebsiteId: In(rootIds) },
    ];
    if (trimmedRunId) {
      pageWhereClauses.push({
        teamId,
        workflowRunId: trimmedRunId,
        googleRootWebsiteId: IsNull(),
      });
    }

    const pages = await this.flaggedRepo.find({
      where: pageWhereClauses,
      order: { createdAt: "DESC" },
      take,
    });

    const byRootId = new Map<string, GoogleFlaggedPage[]>();
    const orphaned: GoogleFlaggedPage[] = [];
    for (const p of pages) {
      if (p.googleRootWebsiteId) {
        const bucket = byRootId.get(p.googleRootWebsiteId);
        if (bucket) bucket.push(p);
        else byRootId.set(p.googleRootWebsiteId, [p]);
      } else {
        orphaned.push(p);
      }
    }

    const out: GoogleFlaggedPagesGroupDto[] = [];
    for (const r of roots) {
      const plist = byRootId.get(r.id);
      if (plist?.length) {
        out.push({ rootWebsite: this.toRootSummary(r), pages: plist });
      }
    }
    if (orphaned.length) {
      out.push({ rootWebsite: null, pages: orphaned });
    }
    return out;
  }

  private toRootSummary(entity: GoogleRootWebsite): GoogleRootWebsiteSummaryDto {
    return {
      id: entity.id,
      websiteUrl: entity.websiteUrl,
      googleMapsSearchUrl: entity.googleMapsSearchUrl,
      phones: entity.phones ?? [],
      emails: entity.emails ?? [],
      linkedinUrl: entity.linkedinUrl,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
