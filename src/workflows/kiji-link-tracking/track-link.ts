import { ChildProcess } from "child_process";
import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
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
const NAVIGATION_TIMEOUT_MS = 30_000;
const BROWSER_CLOSE_TIMEOUT_MS = 5_000;
const BROWSER_KILL_GRACE_MS = 2_000;
const PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

export interface KijijiLinkTrackingResult {
  workflowId: string;
  collectedLinks: string[];
  insertedLinks: string[];
  published: boolean;
}


@Injectable()
export class KijijiLinkTrackingService implements OnApplicationShutdown {
  private readonly logger = new Logger(KijijiLinkTrackingService.name);
  private readonly activeBrowsers = new Set<Browser>();
  private readonly activeBrowserProcesses = new Set<ChildProcess>();

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
      const searchStep = workflow.steps.find(
        (step) => step.name === "search-kijiji",
      );
      const kijijiUrl = searchStep?.values.searchLink;
      await this.trackLink(
        workflow.id,

        kijijiUrl,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.closeActiveBrowsers();
  }

  async trackLink(
    workflowId: string,
    kijijiUrl: string,
  ): Promise<KijijiLinkTrackingResult> {
    const isFetching = await this.cacheService.getData(
      `kijiji-link-tracking:${workflowId}`,
    );
    if (isFetching) {
      // await this.cacheService.evictData(`kijiji-link-tracking:${workflowId}`);
      this.logger.log(
        `Skipping link tracking for ${workflowId} because it is already being fetched`,
      );
      return;
    }
    await this.cacheService.setData(
      `kijiji-link-tracking:${workflowId}`,
      "true",
      60 * 4,
    );
    try {
      const sourceUrl = this.normalizeUrl(kijijiUrl);
      const collectedLinks = await this.collectListingLinks(sourceUrl);
      if (collectedLinks.length === 0) {
        return {
          workflowId,
          collectedLinks,
          insertedLinks: [],
          published: false,
        };
      }

      const knownLinks = await this.kijijiLinkModel
        .find({ workflowId, link: { $in: collectedLinks } })
        .select({ link: 1 })
        .lean();
      const knownLinkSet = new Set(knownLinks.map(({ link }) => link));
      const insertedLinks = collectedLinks.filter(
        (link) => !knownLinkSet.has(link),
      );

      const now = new Date();

      if (insertedLinks.length > 0) {
        await this.kijijiLinkModel.insertMany(
          insertedLinks.map((link) => ({
            workflowId,
            link,
            collectedAt: now,
            lastSeenAt: now,
          })),
          { ordered: false },
        );
      }

      const shouldPublish = insertedLinks.length > 0;
      if (shouldPublish) {
        this.logger.log(`Publishing new kijiji item for ${workflowId}`);
        await this.queuePublisher.publish(Events.NEW_KIJIJI_ITEM, {
          workflowId,
          links: insertedLinks,
          collectedAt: now.toISOString(),
        });
      }
      return {
        workflowId,
        collectedLinks,
        insertedLinks,
        published: shouldPublish,
      };
    } catch (error) {
      this.logger.error(`Failed to track link for ${workflowId}`, {
        message: error?.message,
        stack: error?.stack,
      });
      return {
        workflowId,
        collectedLinks: [],
        insertedLinks: [],
        published: false,
      };
    } finally {
      await this.cacheService.evictData(`kijiji-link-tracking:${workflowId}`);
    }
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
      this.trackBrowser(browser);

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
      await this.closeBrowser(browser);
    }
  }

  private trackBrowser(browser: Browser): void {
    this.activeBrowsers.add(browser);

    const browserProcess = browser.process();
    if (!browserProcess) {
      return;
    }

    this.activeBrowserProcesses.add(browserProcess);
    browserProcess.once("exit", () => {
      this.activeBrowserProcesses.delete(browserProcess);
    });
  }

  private async closeBrowser(browser: Browser | null): Promise<void> {
    if (!browser) {
      return;
    }

    const browserProcess = browser.process();
    try {
      await Promise.race([
        browser.close(),
        this.delay(BROWSER_CLOSE_TIMEOUT_MS).then(() => {
          throw new Error("Timed out closing Kijiji browser session");
        }),
      ]);
    } catch (error) {
      this.logger.warn("Failed to close Kijiji browser gracefully", {
        message: error?.message,
      });
    } finally {
      this.activeBrowsers.delete(browser);
      await this.killBrowserProcess(browserProcess);
    }
  }

  private async closeActiveBrowsers(): Promise<void> {
    await Promise.all(
      Array.from(this.activeBrowsers).map((browser) =>
        this.closeBrowser(browser),
      ),
    );

    await Promise.all(
      Array.from(this.activeBrowserProcesses).map((browserProcess) =>
        this.killBrowserProcess(browserProcess),
      ),
    );
  }

  private async killBrowserProcess(
    browserProcess: ChildProcess | null,
  ): Promise<void> {
    if (!browserProcess || browserProcess.exitCode !== null) {
      return;
    }

    browserProcess.kill("SIGTERM");
    await this.delay(BROWSER_KILL_GRACE_MS);

    if (browserProcess.exitCode === null) {
      browserProcess.kill("SIGKILL");
    }

    this.activeBrowserProcesses.delete(browserProcess);
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private normalizeUrl(url: string, baseUrl?: string): string {
    const normalized = new URL(url, baseUrl);
    normalized.hash = "";
    return normalized.href;
  }
}
