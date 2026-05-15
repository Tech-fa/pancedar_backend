import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsWhere, IsNull, Repository } from "typeorm";
import { BrowserService } from "../../resource-ingestion/browser.service";
import { Events, getListening } from "../../queue/queue-constants";
import { Public } from "../../util/constants";
import { GoogleFlaggedPage } from "./google-flagged-page.entity";
import { GoogleRootWebsite } from "./google-root-website.entity";
import { WorkflowService } from "../workflow.service";
import { WorkflowRunStatus } from "../dto";

export interface ProcessWebsiteQueuePayload {
  websiteUrl: string;
  keywords: string[];
  googleMapsSearchUrl?: string;
  teamId?: string;
  workflowRunId?: string;
  isLast?: boolean;
}

@Injectable()
export class ProcessWebsiteQueueHandler {
  private readonly logger = new Logger(ProcessWebsiteQueueHandler.name);

  constructor(
    private readonly browserService: BrowserService,
    @InjectRepository(GoogleFlaggedPage)
    private readonly flaggedRepo: Repository<GoogleFlaggedPage>,
    @InjectRepository(GoogleRootWebsite)
    private readonly rootWebsiteRepo: Repository<GoogleRootWebsite>,
    private readonly workflowService: WorkflowService,
  ) {}

  @RabbitSubscribe(getListening(Events.PROCESS_WEBSITE))
  @Public()
  async handle(payload: ProcessWebsiteQueuePayload): Promise<void> {
    if (!payload?.websiteUrl?.trim()) {
      this.logger.warn("PROCESS_WEBSITE skipped: websiteUrl missing");
      return;
    }
    if (!payload.keywords?.length) {
      this.logger.warn("PROCESS_WEBSITE skipped: keywords missing");
      return;
    }

    const websiteRoot = await this.resolveWebsiteUrlAfterRedirects(
      payload.websiteUrl,
    );
    const teamId = payload.teamId ?? null;
    this.logger.log(`PROCESS_WEBSITE started for ${websiteRoot}`);
    try {
      const matches = await this.browserService.collectKeywordMatchesAcrossPages(
        websiteRoot,
        payload.keywords,
      );

      if (!matches.length) {
        this.logger.log(
          `PROCESS_WEBSITE no keyword hits for root=${websiteRoot}`,
        );
        return;
      }

      const now = Date.now();
      const contact = await this.browserService.extractPublicContactInfoFromWebsiteRoot(
        websiteRoot,
      );

      let rootEntity = await this.rootWebsiteRepo.findOne({
        where: {
          websiteUrl: websiteRoot,
          workflowRunId: payload.workflowRunId ?? null,
        },
      });
      if (rootEntity) {
        rootEntity.phones = contact.phones ?? rootEntity.phones;
        rootEntity.emails = contact.emails ?? rootEntity.emails ?? [];
        rootEntity.linkedinUrl = contact.linkedinUrl ?? rootEntity.linkedinUrl;
        rootEntity.googleMapsSearchUrl =
          payload.googleMapsSearchUrl ?? rootEntity.googleMapsSearchUrl;
        rootEntity.workflowRunId =
          payload.workflowRunId ?? rootEntity.workflowRunId;
        rootEntity.updatedAt = now;
        await this.rootWebsiteRepo.save(rootEntity);
      } else {
        rootEntity = await this.rootWebsiteRepo.save(
          this.rootWebsiteRepo.create({
            teamId,
            workflowRunId: payload.workflowRunId ?? null,
            googleMapsSearchUrl: payload.googleMapsSearchUrl ?? null,
            websiteUrl: websiteRoot,
            phones: contact.phones || [],
            emails: contact.emails || [],
            linkedinUrl: contact.linkedinUrl,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
      const rootWebsiteId = rootEntity.id;

      for (const m of matches) {
        const existing = await this.flaggedRepo.findOne({
          where: {
            teamId,
            websiteUrl: websiteRoot,
            pageUrl: m.pageUrl,
          },
        });

        if (existing) {
          existing.matchedKeywords = m.matchedKeywords;
          existing.textSnippet = m.textSnippet;
          existing.updatedAt = now;
          existing.googleRootWebsiteId = rootWebsiteId;
          existing.googleMapsSearchUrl =
            payload.googleMapsSearchUrl ?? existing.googleMapsSearchUrl;
          existing.workflowRunId =
            payload.workflowRunId ?? existing.workflowRunId;
          await this.flaggedRepo.save(existing);
        } else {
          await this.flaggedRepo.save(
            this.flaggedRepo.create({
              teamId,
              workflowRunId: payload.workflowRunId ?? null,
              googleRootWebsiteId: rootWebsiteId,
              googleMapsSearchUrl: payload.googleMapsSearchUrl ?? null,
              websiteUrl: websiteRoot,
              pageUrl: m.pageUrl,
              matchedKeywords: m.matchedKeywords,
              textSnippet: m.textSnippet,
              createdAt: now,
              updatedAt: now,
            }),
          );
        }
      }

      if (payload.isLast) {
        this.logger.log(`PROCESS_WEBSITE last website for ${websiteRoot}`);
        await this.workflowService.updateWorkflowRun(payload.workflowRunId, {
          status: WorkflowRunStatus.COMPLETED,
          displayContext: {
            completedAt: now,
          },
          completedView: {
            subject: "flagged_pages",
            id: payload.workflowRunId,
          },
          updatedAt: now,
        });
      }

      this.logger.log(
        `PROCESS_WEBSITE saved ${matches.length} row(s) for ${websiteRoot}`,
      );
    } catch (error) {
      this.logger.error(
        `PROCESS_WEBSITE failed for ${websiteRoot}: ${
          (error as Error).message
        }`,
        (error as Error).stack,
      );
    }
  }

  private rootWebsiteLookupWhere(
    teamId: string | null,
    websiteUrl: string,
    workflowRunId: string | null,
  ): FindOptionsWhere<GoogleRootWebsite> {
    return {
      websiteUrl,
      ...(teamId == null ? { teamId: IsNull() } : { teamId }),
      ...(workflowRunId == null
        ? { workflowRunId: IsNull() }
        : { workflowRunId }),
    };
  }

  /**
   * Follows HTTP redirects (short links, http→https, apex→www) so sitemap crawl
   * and stored `websiteUrl` match the real site. Falls back to the trimmed input
   * when the network request fails.
   */
  private async resolveWebsiteUrlAfterRedirects(raw: string): Promise<string> {
    const trimmed = raw.trim();
    const candidate = this.toAbsoluteHttpUrlForFetch(trimmed);
    if (!candidate) {
      return trimmed;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      let res = await fetch(candidate, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "*/*",
          "User-Agent":
            "Mozilla/5.0 (compatible; TechFA-Automation/1.0; +https://example.invalid)",
        },
      });

      if (res.status === 405 || res.status === 501) {
        res = await fetch(candidate, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent":
              "Mozilla/5.0 (compatible; TechFA-Automation/1.0; +https://example.invalid)",
          },
        });
        await res.body?.cancel?.().catch(() => undefined);
      }

      return res.url || trimmed;
    } catch (e) {
      this.logger.warn(
        `PROCESS_WEBSITE could not resolve redirects for ${trimmed}: ${
          (e as Error).message
        }; using original URL`,
      );
      return trimmed;
    } finally {
      clearTimeout(timeout);
    }
  }

  private toAbsoluteHttpUrlForFetch(raw: string): string | null {
    const t = raw.trim();
    if (!t) {
      return null;
    }
    try {
      const u = /^https?:\/\//i.test(t) ? new URL(t) : new URL(`https://${t}`);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return null;
      }
      return u.href;
    } catch {
      return null;
    }
  }
}
