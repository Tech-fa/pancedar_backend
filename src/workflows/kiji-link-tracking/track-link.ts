import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Model } from "mongoose";
import puppeteer, { Browser } from "puppeteer";
import { Events } from "../../queue/queue-constants";
import { QueuePublisher } from "../../queue/queue.publisher";
import { KijijiLink, KijijiLinkDocument } from "./schemas/kijiji-link.schema";
import { WorkflowService } from "../workflow.service";
import { CacheService } from "src/cache/cache.service";

const SEARCH_LIST_SELECTOR = 'ul[data-testid="srp-search-list"]';
const LISTING_LINK_SELECTOR = `${SEARCH_LIST_SELECTOR} a[data-testid="listing-link"]`;
const LAST_LINK_LIMIT = 20;
const NAVIGATION_TIMEOUT_MS = 30_000;
const PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

export interface KijijiLinkTrackingResult {
  connectorId: string;
  sourceUrl: string;
  collectedLinks: string[];
  insertedLinks: string[];
  published: boolean;
}

interface KijijiNotificationOptions {
  workflowId?: string;
}

@Injectable()
export class KijijiLinkTrackingService {
  private readonly logger = new Logger(KijijiLinkTrackingService.name);

  constructor(
    @InjectModel(KijijiLink.name)
    private readonly kijijiLinkModel: Model<KijijiLinkDocument>,
    private readonly queuePublisher: QueuePublisher,
    private readonly workflowService: WorkflowService,
    private readonly cacheService: CacheService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async trackConfiguredLink(): Promise<void> {
    if (process.env.KIJIJI_LINK_TRACKING_ENABLED != "true") {
      this.logger.warn("Kijiji link tracking is disabled");
      return;
    }
    const workflows = await this.workflowService.findByConnectorType("kijiji");
    for (const workflow of workflows) {
      const connectorId = workflow.linkedConnectors[0].id;
      const searchStep = workflow.steps.find(
        (step) => step.name === "search-kijiji",
      );
      const kijijiUrl = searchStep?.values.searchLink;
      await this.trackLink(connectorId, kijijiUrl, {
        workflowId: workflow.id,
      });
    }
  }

  async trackLink(
    connectorId: string,
    kijijiUrl: string,
    notification?: KijijiNotificationOptions,
  ): Promise<KijijiLinkTrackingResult> {
    const isFetching = await this.cacheService.getData(
      `kijiji-link-tracking:${connectorId}`,
    );
    if (isFetching) {
      this.logger.log(
        `Skipping link tracking for ${connectorId} because it is already being fetched`,
      );
      return;
    }
    await this.cacheService.setData(
      `kijiji-link-tracking:${connectorId}`,
      "true",
      60 * 4,
    );
    const sourceUrl = this.normalizeUrl(kijijiUrl);
    const collectedLinks = await this.collectListingLinks(sourceUrl);

    if (collectedLinks.length === 0) {
      return {
        connectorId,
        sourceUrl,
        collectedLinks,
        insertedLinks: [],
        published: false,
      };
    }
    
    const [existingCount, recentLinks] = await Promise.all([
      this.kijijiLinkModel.countDocuments({ connectorId, sourceUrl }),
      this.kijijiLinkModel
        .find({ connectorId, sourceUrl })
        .sort({ createdAt: -1 })
        .limit(LAST_LINK_LIMIT)
        .select({ link: 1 })
        .lean(),
    ]);

    const recentLinkSet = new Set(recentLinks.map(({ link }) => link));
    const linksMissingFromRecent = collectedLinks.filter(
      (link) => !recentLinkSet.has(link),
    );

    const knownLinks = await this.kijijiLinkModel
      .find({ connectorId, sourceUrl, link: { $in: linksMissingFromRecent } })
      .select({ link: 1 })
      .lean();
    const knownLinkSet = new Set(knownLinks.map(({ link }) => link));
    const insertedLinks = linksMissingFromRecent.filter(
      (link) => !knownLinkSet.has(link),
    );

    const now = new Date();
    await this.kijijiLinkModel.updateMany(
      { connectorId, sourceUrl, link: { $in: collectedLinks } },
      { $set: { lastSeenAt: now } },
    );
    console.log("insertedLinks", insertedLinks.length);
    if (insertedLinks.length > 0) {
      await this.kijijiLinkModel.insertMany(
        insertedLinks.map((link) => ({
          connectorId,
          sourceUrl,
          link,
          collectedAt: now,
          lastSeenAt: now,
        })),
        { ordered: false },
      );
    }

    const shouldPublish = existingCount > 0 && insertedLinks.length > 0;
    if (shouldPublish) {
      console.log("publishing new kijiji item", insertedLinks);
      await this.queuePublisher.publish(Events.NEW_KIJIJI_ITEM, {
        workflowId: notification?.workflowId,
        links: insertedLinks,
        collectedAt: now.toISOString(),
      });
    }
    await this.cacheService.evictData(`kijiji-link-tracking:${connectorId}`);
    return {
      connectorId,
      sourceUrl,
      collectedLinks,
      insertedLinks,
      published: shouldPublish,
    };
  }

  private async collectListingLinks(sourceUrl: string): Promise<string[]> {
    let browser: Browser | null = null;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: PUPPETEER_ARGS,
        ...(process.env.PUPPETEER_EXECUTABLE_PATH
          ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
          : {}),
      });

      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      );

      await page.goto(sourceUrl, {
        waitUntil: "networkidle2",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await page.waitForSelector(LISTING_LINK_SELECTOR, {
        timeout: NAVIGATION_TIMEOUT_MS,
      });

      const links = await page.$$eval(LISTING_LINK_SELECTOR, (anchors) =>
        anchors
          .map((anchor) => anchor.getAttribute("href"))
          .filter((href): href is string => Boolean(href)),
      );

      return Array.from(
        new Set(links.map((link) => this.normalizeUrl(link, sourceUrl))),
      );
    } catch (error) {
      this.logger.error(`Failed to collect Kijiji links from ${sourceUrl}`, {
        message: error?.message,
        stack: error?.stack,
      });
      return [];
    } finally {
      await browser?.close();
    }
  }

  private normalizeUrl(url: string, baseUrl?: string): string {
    const normalized = new URL(url, baseUrl);
    normalized.hash = "";
    return normalized.href;
  }
}
