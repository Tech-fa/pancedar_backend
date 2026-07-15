import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { connect } from "puppeteer-real-browser";
import type { Browser, ElementHandle, Page } from "rebrowser-puppeteer-core";

const NAVIGATION_TIMEOUT_MS = 30_000;
const LINKEDIN_NAVIGATION_TIMEOUT_MS = 45_000;
const MAX_LINKEDIN_SHOW_MORE_CLICKS = 25;
const MAX_LINKEDIN_ACTIVITY_SCROLL_ROUNDS = 12;
const MAX_LINKEDIN_SEARCH_PAGES = 10;
const CARLETON_PARKING_URL = "https://carletonparking.com";

export type LinkedInPersonProfile = {
  name: string;
  position: string;
  profileUrl?: string | null;
};

export type LinkedInCompanyProfile = {
  name: string;
  companyUrl: string;
};

export type LinkedInPeopleScrapeResult = {
  associatedMembersCount: number | null;
  profiles: LinkedInPersonProfile[];
  skipReason?: string;
};

export type LinkedInCompanyScrapeResult = {
  companies: LinkedInCompanyProfile[];
  skipReason?: string;
};

export type LinkedInContentSearchPostCandidate = {
  companyUrl: string;
  companyName: string;
  postContent: string;
  postKey: string;
  /** Set when the post author is a person profile; resolved to companyUrl later. */
  authorProfileUrl?: string;
};

export type LinkedInContentSearchPostsResult = {
  posts: LinkedInContentSearchPostCandidate[];
  searchUrl: string;
  skipReason?: string;
};

export type LinkedInCompanyHeadquartersResult = {
  location: string | null;
  skipReason?: string;
};

export type LinkedInContentPostLinkResult = {
  postLink: string | null;
  skipReason?: string;
};

const MAX_LINKEDIN_CONTENT_SEARCH_POSTS = 100;
const LINKEDIN_CONTENT_SEARCH_BASE_URL =
  "https://www.linkedin.com/search/results/content/";

/** Credentials from the LinkedIn connector (`connector-types.config.ts`). */
export type LinkedInAuthCredentials = {
  username: string;
  password: string;
};
const CARLETON_MAX_REGISTRATION_ATTEMPTS = 5;
// Visiting Google before the Carleton form lets Google's invisible reCAPTCHA
// client set its trust cookies (NID, __Secure-…) against this profile, which
// is the single biggest free score boost on datacenter/cold-start IPs.
const PREWARM_URL = "https://www.google.com/";

export type CarletonParkingRegistrationInput = {
  address: string;
  unitNumber: string;
  licensePlate: string;
  numberOfNights: number;
};

const PUPPETEER_ARGS = [
  // Required when running as root inside a Linux container (which is the
  // default in our Docker image) — Chromium refuses to launch otherwise.
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

const getPuppeteerArgs = (): string[] => [
  ...PUPPETEER_ARGS,
  ...(process.env.PUPPETEER_PROXY_SERVER
    ? [`--proxy-server=${process.env.PUPPETEER_PROXY_SERVER}`]
    : []),
];

const getProxyConfig = ():
  | { host: string; port: number; username?: string; password?: string }
  | undefined => {
  const proxyServer = process.env.PUPPETEER_PROXY_SERVER;
  if (!proxyServer) {
    return undefined;
  }
  const proxyUrl = new URL(
    proxyServer.includes("://") ? proxyServer : `http://${proxyServer}`,
  );
  const username = process.env.PUPPETEER_PROXY_USERNAME;
  const password = process.env.PUPPETEER_PROXY_PASSWORD;
  return {
    host: proxyUrl.hostname,
    port: Number(proxyUrl.port),
    ...(username && password ? { username, password } : {}),
  };
};

/**
 * Carleton parking and other flows that need a “real” browser session
 * (same stack as web_scraping `track-link-real.ts`: puppeteer-real-browser `connect`).
 */
@Injectable()
export class RealBrowserService {
  private readonly logger = new Logger(RealBrowserService.name);

  /**
   * Fills the Carleton parking web form and returns a path to a PNG screenshot.
   * Caller must delete the file after use.
   */
  async carletonParkingRegistration(
    input: CarletonParkingRegistrationInput,
  ): Promise<string> {
    const screenshotPath = path.join(
      os.tmpdir(),
      `carleton-parking-${randomUUID()}.png`,
    );
    let browser: Browser | null = null;
    try {
      const userDataDir = await this.resolveUserDataDir();

      const { browser: b, page } = await connect({
        headless: process.env.HEADLESS === "true",
        args: getPuppeteerArgs(),
        customConfig: {
          ...(process.env.PUPPETEER_EXECUTABLE_PATH
            ? { chromePath: process.env.PUPPETEER_EXECUTABLE_PATH }
            : {}),
          // Persistent profile (when configured) lets Google reCAPTCHA cookies
          // accumulated by previous runs carry over, which materially raises
          // the score on a datacenter IP where every cold-start session would
          // otherwise score too low to pass server-side verification.
          ...(userDataDir ? { userDataDir } : {}),
        },
        proxy: getProxyConfig(),
        turnstile: true,
        connectOption: {
          defaultViewport: null,
        },
        disableXvfb: process.env.DISABLE_XVFB === "true",
      });
      browser = b;

      // Intentionally do not call page.setUserAgent here. puppeteer-real-browser
      // boots an actual Chrome and we want its real UA / userAgentData /
      // sec-ch-ua-* headers to be consistent. Overriding the UA string but
      // leaving the high-entropy client hints untouched is a strong bot signal
      // for reCAPTCHA and is the most common cause of server-side reCAPTCHA
      // verification failures that surface as 500s on this site.

      this.attachNetworkDebugLogging(page);

      await this.prewarmGoogle(page);

      await page.goto(CARLETON_PARKING_URL, {
        waitUntil: "networkidle2",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await this.humanPause(150, 500);
      await page.screenshot({
        path: "screenshot.png",
        fullPage: true,
      });
      // Submit can fail with a 500 the first time even when everything is
      // correct (the site does server-side reCAPTCHA verification and a fresh
      // session sometimes scores too low). Retrying via the "back to
      // registration" link after a failure is enough to succeed because the
      // page already accumulated reCAPTCHA trust and Google cookies.
      let succeeded = false;
      for (
        let attempt = 1;
        attempt <= CARLETON_MAX_REGISTRATION_ATTEMPTS;
        attempt++
      ) {
        if (attempt > 1) {
          this.logger.warn(
            `[carleton] submit attempt ${attempt} after previous failure; returning to registration form`,
          );
          await this.returnToRegistrationForm(page);
        }

        await this.fillCarletonParkingForm(page, input);
        succeeded = await this.submitAndCheckOutcome(page);
        if (succeeded) {
          this.logger.log(
            `[carleton] submission succeeded on attempt ${attempt} (url=${page.url()})`,
          );
          break;
        }
        this.logger.warn(
          `[carleton] submission attempt ${attempt} did not reach the confirmation page (url=${page.url()})`,
        );
      }

      if (!succeeded) {
        this.logger.warn(
          `[carleton] all ${CARLETON_MAX_REGISTRATION_ATTEMPTS} submission attempts failed; capturing final page state`,
        );
      }

      await page.screenshot({
        path: screenshotPath,
        type: "png",
        fullPage: true,
      });
      return screenshotPath;
    } catch (error) {
      this.logger.error(
        `Carleton parking registration failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      try {
        await fs.unlink(screenshotPath);
      } catch {
        /* ignore */
      }
      throw error;
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  async launchBrowser(): Promise<Browser> {
    const userDataDir = await this.resolveUserDataDir();
    const { browser } = await connect({
      headless: process.env.HEADLESS === "true",
      args: getPuppeteerArgs(),
      customConfig: {
        ...(process.env.PUPPETEER_EXECUTABLE_PATH
          ? { chromePath: process.env.PUPPETEER_EXECUTABLE_PATH }
          : {}),
        ...(userDataDir ? { userDataDir } : {}),
      },
      proxy: getProxyConfig(),
      turnstile: false,
      connectOption: { defaultViewport: null },
      disableXvfb: process.env.DISABLE_XVFB === "true",
    });
    return browser;
  }

  /**
   * Searches Google for blog posts related to `topic` and returns organic result
   * titles, URLs, and snippets (up to `maxResults`, default 8).
   */
  async searchGoogleRelatedBlogs(
    topic: string,
    maxResults = 8,
  ): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const query = `${topic.trim()} blog`;
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://www.google.com/search?q=${encodedQuery}&hl=en`;
    let browser: Browser | null = null;
    try {
      const userDataDir = await this.resolveUserDataDir();
      const { browser: b, page } = await connect({
        headless: process.env.HEADLESS === "true",
        args: getPuppeteerArgs(),
        customConfig: {
          ...(process.env.PUPPETEER_EXECUTABLE_PATH
            ? { chromePath: process.env.PUPPETEER_EXECUTABLE_PATH }
            : {}),
          ...(userDataDir ? { userDataDir } : {}),
        },
        proxy: getProxyConfig(),
        turnstile: false,
        connectOption: { defaultViewport: null },
        disableXvfb: process.env.DISABLE_XVFB === "true",
      });
      browser = b;
      await this.prewarmGoogle(page);
      await page.goto(searchUrl, {
        waitUntil: "networkidle2",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await this.humanPause(500, 1200);

      const asyncContextSelector = `div[data-async-context="query:${encodedQuery}"]`;
      await page
        .waitForSelector(asyncContextSelector, { timeout: 20_000 })
        .catch(() => undefined);

      const results = await page.evaluate(
        (limit, encodedQueryArg) => {
          const out: Array<{
            title: string;
            url: string;
            snippet: string;
          }> = [];
          const seen = new Set<string>();

          const unwrapGoogleRedirect = (href: string): string | null => {
            try {
              const u = new URL(href);
              const host = u.hostname.replace(/^www\./, "");
              if (host === "google.com" && u.pathname === "/url") {
                return u.searchParams.get("q") || u.searchParams.get("url");
              }
              return href;
            } catch {
              return null;
            }
          };

          const findResultsContainer = (): Element | null => {
            const candidates = [
              `query:${encodedQueryArg}`,
              `query:${encodedQueryArg.replace(/%20/g, "+")}`,
            ];
            for (const value of candidates) {
              const el = document.querySelector(
                `div[data-async-context="${value}"]`,
              );
              if (el) return el;
            }
            const plusQuery = decodeURIComponent(encodedQueryArg).replace(
              / /g,
              "+",
            );
            const plusEl = document.querySelector(
              `div[data-async-context="query:${plusQuery}"]`,
            );
            if (plusEl) return plusEl;

            for (const el of document.querySelectorAll(
              'div[data-async-context^="query:"]',
            )) {
              const ctx = el.getAttribute("data-async-context") || "";
              if (
                ctx === `query:${encodedQueryArg}` ||
                ctx.includes(encodedQueryArg)
              ) {
                return el;
              }
            }
            return null;
          };

          const container = findResultsContainer();
          if (!container) {
            return out;
          }

          // Organic results: anchor links inside child divs of the async-context root.
          const blocks = container.querySelectorAll(":scope > div");
          blocks.forEach((block) => {
            if (out.length >= limit) return;
            const link = block.querySelector<HTMLAnchorElement>("a[href]");
            if (!link) return;
            const rawHref = link.href || "";
            const url = unwrapGoogleRedirect(rawHref);
            if (!url || seen.has(url)) return;
            if (/google\.com/i.test(url)) return;
            const title = (link.textContent || "").trim();
            if (!title) return;
            const snippetEl =
              block.querySelector(".VwiC3b") ||
              block.querySelector("[data-sncf]") ||
              block.querySelector(".st");
            const snippet = (snippetEl?.textContent || "").trim();
            seen.add(url);
            out.push({ title, url, snippet });
          });
          return out;
        },
        maxResults,
        encodedQuery,
      );

      this.logger.log(
        `[seo-helper] Google blog search for "${topic}": ${results.length} result(s)`,
      );
      return results;
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  /**
   * Opens a Google Maps search/list URL, scrolls the results feed, and collects
   * external website URLs from `a[aria-label]` values that start with "Visit".
   * Results load incrementally while scrolling the left results pane (role="feed"
   * or the nearest overflow-y scroll ancestor of each `[role="article"]`).
   */
  async scrapeGoogleMapsBusinessWebsiteLinks(
    googleMapsUrl: string,
    onEachLink?: (link: string, isLast: boolean) => Promise<void>,
  ): Promise<string[]> {
    let browser: Browser | null = null;
    try {
      const userDataDir = await this.resolveUserDataDir();

      const { browser: b, page } = await connect({
        headless: process.env.HEADLESS === "true",
        args: getPuppeteerArgs(),
        customConfig: {
          ...(process.env.PUPPETEER_EXECUTABLE_PATH
            ? { chromePath: process.env.PUPPETEER_EXECUTABLE_PATH }
            : {}),
          ...(userDataDir ? { userDataDir } : {}),
        },
        proxy: getProxyConfig(),
        // Turnstile mode runs a 1s polling loop that clicks ~300px-wide empty divs
        // (Cloudflare heuristic). On Google Maps that matches unrelated UI and causes
        // spurious clicks and “Copied to clipboard” toasts. Maps does not use CF Turnstile.
        turnstile: false,
        connectOption: {
          defaultViewport: null,
        },
        disableXvfb: process.env.DISABLE_XVFB === "true",
      });
      browser = b;

      this.attachNetworkDebugLogging(page);
      await this.prewarmGoogle(page);

      await page.goto(googleMapsUrl, {
        waitUntil: "networkidle2",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await this.humanPause(500, 1200);

      await page
        .waitForSelector('[role="article"]', { timeout: 25_000 })
        .catch(() => undefined);

      const collected = new Set<string>();
      let stableRounds = 0;

      for (let round = 0; round < 80; round++) {
        const batch = await page.evaluate(() => {
          const results: string[] = [];
          const seenLocal = new Set<string>();

          const unwrapGoogleRedirect = (href: string): string | null => {
            try {
              const u = new URL(href);
              const host = u.hostname.replace(/^www\./, "");
              if (host === "google.com") {
                if (u.pathname === "/url") {
                  return (
                    u.searchParams.get("q") || u.searchParams.get("url") || null
                  );
                }
              }
              return href;
            } catch {
              return null;
            }
          };

          document.querySelectorAll('[role="article"]').forEach((article) => {
            article.querySelectorAll("a[href][aria-label]").forEach((a) => {
              const label = (a.getAttribute("aria-label") || "").trim();
              if (!/^visit/i.test(label)) {
                return;
              }
              const raw = (a as HTMLAnchorElement).href;
              const cleaned = unwrapGoogleRedirect(raw);
              if (!cleaned || seenLocal.has(cleaned)) {
                return;
              }
              seenLocal.add(cleaned);
              results.push(cleaned);
            });
          });
          return results;
        });

        const beforeSize = collected.size;

        for (let i = 0; i < batch.length; i++) {
          const u = batch[i];
          if (collected.has(u)) {
            if (i === batch.length - 1 && round === 79) {
              await onEachLink?.(u, true);
            }
            continue;
          }
          collected.add(u);
          if (onEachLink) {
            await onEachLink(u, round === 79 && i === batch.length - 1);
          }
        }
        if (collected.size === beforeSize) {
          stableRounds += 1;
        } else {
          stableRounds = 0;
        }
        if (stableRounds >= 5) {
          break;
        }
        await this.humanPause(280, 650);
        const { endOfList } = await this.scrollGoogleMapsResultsFeed(page);
        if (endOfList) {
          break;
        }
        await this.humanPause(280, 650);
      }

      return [...collected];
    } catch (error) {
      this.logger.error(
        `Google Maps business scrape failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  /**
   * Opens the company LinkedIn `/people` page, reads the associated-members count,
   * and (when under 100 members) collects "People you may know" cards until "Show more results"
   * is exhausted.
   */
  async collectLinkedInPeopleProfiles(
    companyLinkedInUrl: string,
    credentials?: LinkedInAuthCredentials,
  ): Promise<LinkedInPeopleScrapeResult> {
    const peopleUrl = this.toLinkedInPeopleUrl(companyLinkedInUrl);
    let browser: Browser | null = null;
    try {
      const page = await this.openRealBrowserPage((b) => {
        browser = b;
      });
      await page.goto(peopleUrl, {
        waitUntil: "domcontentloaded",
        timeout: LINKEDIN_NAVIGATION_TIMEOUT_MS,
      });
      await this.humanPause(800, 1600);

      const sessionReady = await this.ensureLinkedInSession(
        page,
        credentials,
        peopleUrl,
      );
      if (!sessionReady) {
        return {
          associatedMembersCount: null,
          profiles: [],
          skipReason: "linkedin_auth_required",
        };
      }

      const associatedMembersCount = await this.readLinkedInAssociatedMembersCount(
        page,
      );
      if (associatedMembersCount !== null && associatedMembersCount >= 1000) {
        this.logger.log(
          `[linkedin] skipping people scrape: ${associatedMembersCount} associated members`,
        );
        return {
          associatedMembersCount,
          profiles: [],
          skipReason: "too_many_associated_members",
        };
      }

      await page
        .waitForFunction(
          () => {
            const headings = Array.from(document.querySelectorAll("h2"));
            return headings.some((h) =>
              /people you may know/i.test(h.textContent || ""),
            );
          },
          { timeout: 20_000 },
        )
        .catch(() => undefined);

      for (let i = 0; i < MAX_LINKEDIN_SHOW_MORE_CLICKS; i++) {
        const clicked = await this.clickLinkedInShowMoreResults(page);
        if (!clicked) {
          break;
        }
        await this.humanPause(500, 1100);
      }

      const profiles = await this.readLinkedInPeopleYouMayKnowProfiles(page);
      this.logger.log(
        `[linkedin] collected ${profiles.length} profile(s) from ${peopleUrl}`,
      );
      return { associatedMembersCount, profiles };
    } catch (error) {
      this.logger.error(
        `LinkedIn people scrape failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  /** Opens a new tab on an existing browser (caller owns browser lifecycle). */
  async createPageFromBrowser(browser: Browser): Promise<Page> {
    const page = await browser.newPage();
    this.attachNetworkDebugLogging(page);
    return page;
  }

  /**
   * Visits a member profile's `/recent-activity/all/` feed, scrolls the finite-scroll
   * container, and returns up to `maxSnippets` post texts from `feed-shared-update-v2`.
   */
  async collectLinkedInProfileActivitySnippets(
    profileUrl: string,
    maxSnippets = 5,
    credentials?: LinkedInAuthCredentials,
    browser?: Browser,
  ): Promise<string[]> {
    const activityUrl = this.toLinkedInRecentActivityUrl(profileUrl);
    const launchedHere = !browser;
    let page: Page | null = null;

    try {
      if (!browser) {
        page = await this.openRealBrowserPage((b) => {
          browser = b;
        });
      } else {
        page = await this.createPageFromBrowser(browser);
      }

      await page.goto(activityUrl, {
        waitUntil: "domcontentloaded",
        timeout: LINKEDIN_NAVIGATION_TIMEOUT_MS,
      });
      await this.humanPause(800, 1600);

      const sessionReady = await this.ensureLinkedInSession(
        page,
        credentials,
        activityUrl,
      );
      if (!sessionReady) {
        return [];
      }

      const collected: string[] = [];
      const seen = new Set<string>();

      for (
        let round = 0;
        round < MAX_LINKEDIN_ACTIVITY_SCROLL_ROUNDS;
        round++
      ) {
        const batch = await page.evaluate(() => {
          const normalize = (t: string) => t.replace(/\s+/g, " ").trim();
          const results: string[] = [];
          const seenLocal = new Set<string>();
          document
            .querySelectorAll(".feed-shared-update-v2")
            .forEach((node) => {
              const text = normalize((node as HTMLElement).innerText || "");
              if (text.length < 40 || seenLocal.has(text)) {
                return;
              }
              seenLocal.add(text);
              results.push(text);
            });
          return results;
        });

        for (const text of batch) {
          if (seen.has(text)) {
            continue;
          }
          seen.add(text);
          collected.push(text);
          if (collected.length >= maxSnippets) {
            return collected.slice(0, maxSnippets);
          }
        }

        const { atEnd } = await this.scrollLinkedInFiniteScroll(page);
        if (atEnd && collected.length >= maxSnippets) {
          break;
        }
        if (atEnd && round > 2) {
          break;
        }
        await this.humanPause(400, 900);
      }

      return collected.slice(0, maxSnippets);
    } catch (error) {
      this.logger.error(
        `LinkedIn activity scrape failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    } finally {
      await page?.close().catch(() => undefined);
      if (launchedHere && browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }

  /**
   * Opens a LinkedIn people search URL, signs in when needed, and collects profile
   * links from the first `maxPages` result pages (`[role="list"]` → `li` → anchor).
   */
  async collectLinkedInSearchPeopleProfileUrls(
    searchUrl: string,
    maxPages = MAX_LINKEDIN_SEARCH_PAGES,
    credentials?: LinkedInAuthCredentials,
  ): Promise<LinkedInPeopleScrapeResult> {
    const trimmed = searchUrl?.trim();
    if (!trimmed) {
      return {
        associatedMembersCount: null,
        profiles: [],
        skipReason: "no_search_url",
      };
    }

    const pageLimit = Math.min(
      Math.max(maxPages, 1),
      MAX_LINKEDIN_SEARCH_PAGES,
    );
    let browser: Browser | null = null;
    try {
      const page = await this.openRealBrowserPage((b) => {
        browser = b;
      });

      const allProfiles: LinkedInPersonProfile[] = [];
      const seenUrls = new Set<string>();

      for (let pageNum = 1; pageNum <= pageLimit; pageNum++) {
        const pageUrl = this.toLinkedInSearchPageUrl(trimmed, pageNum);
        await page.goto(pageUrl, {
          waitUntil: "domcontentloaded",
          timeout: LINKEDIN_NAVIGATION_TIMEOUT_MS,
        });
        await this.humanPause(900, 1800);
        this.logger.log(
          `[linkedin] visiting search page ${pageNum}/${pageLimit}: ${pageUrl}`,
        );
        const sessionReady = await this.ensureLinkedInSession(
          page,
          credentials,
          pageUrl,
        );
        if (!sessionReady) {
          return {
            associatedMembersCount: null,
            profiles: allProfiles,
            skipReason: allProfiles.length
              ? undefined
              : "linkedin_auth_required",
          };
        }

        await page
          .waitForSelector('[role="list"] li a[href*="/in/"]', {
            timeout: 25_000,
          })
          .catch(() => undefined);
        await this.humanPause(400, 900);
        await this.scrollLinkedInSearchResultsHuman(page);

        const batch = await this.readLinkedInSearchPeopleListProfiles(page);
        for (const profile of batch) {
          const profileUrl = profile.profileUrl?.trim();
          if (!profileUrl || seenUrls.has(profileUrl)) {
            continue;
          }
          seenUrls.add(profileUrl);
          allProfiles.push({ ...profile, profileUrl });
        }

        this.logger.log(
          `[linkedin] search page ${pageNum}/${pageLimit}: +${batch.length} profile(s), total ${allProfiles.length}`,
        );

        if (pageNum < pageLimit) {
          const hasNext = await this.navigateLinkedInSearchNextPage(
            page,
            trimmed,
            pageNum + 1,
          );
          if (!hasNext) {
            break;
          }
          await this.humanPause(700, 1400);
        }
      }

      return { associatedMembersCount: null, profiles: allProfiles };
    } catch (error) {
      this.logger.error(
        `LinkedIn search people scrape failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  /**
   * Opens a LinkedIn company search URL, signs in when needed, and collects
   * company page links from the first `maxPages` result pages.
   */
  async collectLinkedInSearchCompanyUrls(
    searchUrl: string,
    maxPages = MAX_LINKEDIN_SEARCH_PAGES,
    credentials?: LinkedInAuthCredentials,
    startPage = 1,
  ): Promise<LinkedInCompanyScrapeResult> {
    const trimmed = searchUrl?.trim();
    if (!trimmed) {
      return { companies: [], skipReason: "no_search_url" };
    }

    const pageLimit = Math.min(
      Math.max(maxPages, 1),
      MAX_LINKEDIN_SEARCH_PAGES,
    );
    let browser: Browser | null = null;
    try {
      const page = await this.openRealBrowserPage((b) => {
        browser = b;
      });

      const allCompanies: LinkedInCompanyProfile[] = [];
      const seenUrls = new Set<string>();
      const firstPage = Math.max(startPage, 1);

      for (let pageNum = firstPage; pageNum <= pageLimit; pageNum++) {
        const pageUrl = this.toLinkedInSearchPageUrl(trimmed, pageNum);
        await page.goto(pageUrl, {
          waitUntil: "domcontentloaded",
          timeout: LINKEDIN_NAVIGATION_TIMEOUT_MS,
        });
        await this.humanPause(900, 1800);
        this.logger.log(
          `[linkedin] visiting company search page ${pageNum}/${pageLimit}: ${pageUrl}`,
        );

        const sessionReady = await this.ensureLinkedInSession(
          page,
          credentials,
          pageUrl,
        );
        if (!sessionReady) {
          return {
            companies: allCompanies,
            skipReason: allCompanies.length
              ? undefined
              : "linkedin_auth_required",
          };
        }

        await page
          .waitForSelector(
            '[aria-label="Primary content"] a[href*="/company/"]',
            { timeout: 25_000 },
          )
          .catch(() => undefined);
        await this.humanPause(400, 900);
        await this.scrollLinkedInSearchResultsHuman(page);

        const batch = await this.readLinkedInSearchCompanyListProfiles(page);
        for (const company of batch) {
          if (seenUrls.has(company.companyUrl)) {
            continue;
          }
          seenUrls.add(company.companyUrl);
          allCompanies.push(company);
        }

        this.logger.log(
          `[linkedin] company search page ${pageNum}/${pageLimit}: +${batch.length} company(ies), total ${allCompanies.length}`,
        );

       
      }

      return { companies: allCompanies };
    } catch (error) {
      this.logger.error(
        `LinkedIn search company scrape failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  buildLinkedInContentSearchUrl(searchWord: string): string {
    const u = new URL(LINKEDIN_CONTENT_SEARCH_BASE_URL);
    u.searchParams.set("keywords", searchWord.trim());
    u.searchParams.set("origin", "GLOBAL_SEARCH_HEADER");
    u.searchParams.set("sortBy", '["date_posted"]');
    u.searchParams.set("datePosted", '["past-24h"]');
    return u.href;
  }

  /**
   * Opens LinkedIn content search (past 24h), scrolls results, and collects up to
   * `maxPosts` posts from content cards (`role="listitem"`). Company-authored
   * posts use the company link directly; person-authored posts resolve the
   * employer from the profile Experience section before returning.
   */
  async collectLinkedInContentSearchPosts(
    searchWord: string,
    maxPosts = MAX_LINKEDIN_CONTENT_SEARCH_POSTS,
    credentials?: LinkedInAuthCredentials,
  ): Promise<LinkedInContentSearchPostsResult> {
    const keyword = searchWord?.trim();
    if (!keyword) {
      return { posts: [], searchUrl: "", skipReason: "no_search_word" };
    }

    const searchUrl = this.buildLinkedInContentSearchUrl(keyword);
    const postLimit = Math.min(Math.max(maxPosts, 1), MAX_LINKEDIN_CONTENT_SEARCH_POSTS);
    let browser: Browser | null = null;

    try {
      const page = await this.openRealBrowserPage((b) => {
        browser = b;
      });

      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: LINKEDIN_NAVIGATION_TIMEOUT_MS,
      });
      await this.humanPause(900, 1800);
      this.logger.log(`[linkedin] visiting content search: ${searchUrl}`);

      const sessionReady = await this.ensureLinkedInSession(
        page,
        credentials,
        searchUrl,
      );
      if (!sessionReady) {
        return { posts: [], searchUrl, skipReason: "linkedin_auth_required" };
      }

      await page
        .waitForSelector(
          'div[role="listitem"], a[href*="/company/"], a[href*="/in/"]',
          { timeout: 25_000 },
        )
        .catch(() => undefined);
      await this.humanPause(400, 900);

      const allPosts: LinkedInContentSearchPostCandidate[] = [];
      const seenKeys = new Set<string>();
      let stagnantRounds = 0;

      while (allPosts.length < postLimit && stagnantRounds < 8) {
        const batch = await this.readLinkedInContentSearchPosts(page);
        let added = 0;
        for (const post of batch) {
          if (seenKeys.has(post.postKey)) {
            continue;
          }
          seenKeys.add(post.postKey);
          allPosts.push(post);
          added++;
          if (allPosts.length >= postLimit) {
            break;
          }
        }

        this.logger.log(
          `[linkedin] content search: +${added} post(s), total ${allPosts.length}/${postLimit}`,
        );

        if (added === 0) {
          stagnantRounds++;
        } else {
          stagnantRounds = 0;
        }

        if (allPosts.length >= postLimit) {
          break;
        }

        const scrolled = await this.scrollLinkedInContentSearchResults(page);
        if (!scrolled) {
          stagnantRounds++;
        }
        await this.humanPause(500, 1100);
      }

      const resolvedPosts = await this.resolveLinkedInContentSearchPostCompanies(
        browser,
        allPosts.slice(0, postLimit),
        credentials,
      );

      return { posts: resolvedPosts, searchUrl };
    } catch (error) {
      this.logger.error(
        `LinkedIn content search scrape failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  /**
   * Reads headquarters location from a company /about page (sibling of the h3
   * parent for the "Headquarters" heading, e.g. "San Francisco, CA").
   */
  async getLinkedInCompanyHeadquarters(
    companyUrl: string,
    credentials?: LinkedInAuthCredentials,
    browser?: Browser,
  ): Promise<LinkedInCompanyHeadquartersResult> {
    const normalized = this.normalizeLinkedInCompanyUrl(companyUrl);
    if (!normalized) {
      return { location: null, skipReason: "invalid_company_url" };
    }

    const aboutUrl = this.toLinkedInCompanyAboutUrl(normalized);
    const ownsBrowser = !browser;
    let localBrowser: Browser | null = browser ?? null;

    try {
      const page = browser
        ? await browser.newPage()
        : await this.openRealBrowserPage((b) => {
            localBrowser = b;
          });

      try {
        await page.goto(aboutUrl, {
          waitUntil: "domcontentloaded",
          timeout: LINKEDIN_NAVIGATION_TIMEOUT_MS,
        });
        await this.humanPause(800, 1600);

        const sessionReady = await this.ensureLinkedInSession(
          page,
          credentials,
          aboutUrl,
        );
        if (!sessionReady) {
          return { location: null, skipReason: "linkedin_auth_required" };
        }

        await page
          .waitForSelector("h3, dl", { timeout: 20_000 })
          .catch(() => undefined);
        await this.humanPause(300, 700);

        const location = await this.readLinkedInCompanyHeadquartersLocation(page);
        return { location };
      } finally {
        if (browser) {
          await page.close().catch(() => undefined);
        }
      }
    } catch (error) {
      this.logger.warn(
        `[linkedin] headquarters scrape failed for ${companyUrl}: ${
          (error as Error).message
        }`,
      );
      return { location: null, skipReason: (error as Error).message };
    } finally {
      if (ownsBrowser) {
        await localBrowser?.close().catch(() => undefined);
      }
    }
  }

  /**
   * Returns true when headquarters text indicates US or Canada.
   */
  isUsOrCanadaHeadquarters(location: string | null | undefined): boolean {
    const text = (location ?? "").trim();
    if (!text) {
      return false;
    }
    return this.parseNorthAmericaHeadquarters(text);
  }

  /**
   * Finds a content-search post card by company URL + content snippet, opens the
   * control menu, and copies the post permalink.
   */
  async extractLinkedInContentPostLink(
    searchUrl: string,
    companyUrl: string,
    postContent: string,
    credentials?: LinkedInAuthCredentials,
    browser?: Browser,
  ): Promise<LinkedInContentPostLinkResult> {
    const trimmedSearch = searchUrl?.trim();
    const normalizedCompany = this.normalizeLinkedInCompanyUrl(companyUrl);
    if (!trimmedSearch || !normalizedCompany) {
      return { postLink: null, skipReason: "missing_search_or_company_url" };
    }

    const ownsBrowser = !browser;
    let localBrowser: Browser | null = browser ?? null;

    try {
      const page = browser
        ? await browser.newPage()
        : await this.openRealBrowserPage((b) => {
            localBrowser = b;
          });

      try {
        await page.goto(trimmedSearch, {
          waitUntil: "domcontentloaded",
          timeout: LINKEDIN_NAVIGATION_TIMEOUT_MS,
        });
        await this.humanPause(900, 1800);

        const sessionReady = await this.ensureLinkedInSession(
          page,
          credentials,
          trimmedSearch,
        );
        if (!sessionReady) {
          return { postLink: null, skipReason: "linkedin_auth_required" };
        }

        await page
          .waitForSelector('a[href*="/company/"]', { timeout: 25_000 })
          .catch(() => undefined);

        const snippet = postContent.trim().slice(0, 120);
        let found = false;
        for (let round = 0; round < 12 && !found; round++) {
          found = await this.clickLinkedInContentPostControlMenu(
            page,
            normalizedCompany,
            snippet,
          );
          if (found) {
            break;
          }
          await this.scrollLinkedInContentSearchResults(page);
          await this.humanPause(400, 900);
        }

        if (!found) {
          return { postLink: null, skipReason: "post_not_found_on_search_page" };
        }

        await this.humanPause(300, 700);
        const postLink = await this.copyLinkedInPostLinkFromMenu(page);
        if (!postLink?.trim()) {
          return { postLink: null, skipReason: "post_link_not_copied" };
        }

        return { postLink: postLink.trim() };
      } finally {
        if (browser) {
          await page.close().catch(() => undefined);
        }
      }
    } catch (error) {
      this.logger.warn(
        `[linkedin] post link extraction failed: ${(error as Error).message}`,
      );
      return { postLink: null, skipReason: (error as Error).message };
    } finally {
      if (ownsBrowser) {
        await localBrowser?.close().catch(() => undefined);
      }
    }
  }

  async openRealBrowserPage(
    onBrowser: (browser: Browser) => void,
  ): Promise<Page> {
    const userDataDir = await this.resolveUserDataDir();
    const { browser, page } = await connect({
      headless: process.env.HEADLESS === "true",
      args: getPuppeteerArgs(),
      customConfig: {
        ...(process.env.PUPPETEER_EXECUTABLE_PATH
          ? { chromePath: process.env.PUPPETEER_EXECUTABLE_PATH }
          : {}),
        ...(userDataDir ? { userDataDir } : {}),
      },
      proxy: getProxyConfig(),
      turnstile: false,
      connectOption: {
        defaultViewport: null,
      },
      disableXvfb: process.env.DISABLE_XVFB === "true",
    });
    onBrowser(browser);
    this.attachNetworkDebugLogging(page);
    await this.prewarmGoogle(page);
    return page;
  }

  private toLinkedInPeopleUrl(companyLinkedInUrl: string): string {
    try {
      const u = new URL(companyLinkedInUrl.trim());
      const companyMatch = u.pathname.match(/^\/company\/([^/]+)/i);
      if (companyMatch) {
        u.pathname = `/company/${companyMatch[1]}/people`;
        return u.href;
      }
      let path = u.pathname.replace(/\/+$/, "");
      if (!/\/people$/i.test(path)) {
        path = `${path}/people`;
      }
      u.pathname = path;
      return u.href;
    } catch {
      const companyMatch = companyLinkedInUrl
        .trim()
        .match(/\/company\/([^/]+)/i);
      if (companyMatch) {
        return `https://www.linkedin.com/company/${companyMatch[1]}/people`;
      }
      const t = companyLinkedInUrl.trim().replace(/\/+$/, "");
      return /\/people$/i.test(t) ? t : `${t}/people`;
    }
  }

  private toLinkedInCompanyAboutUrl(companyLinkedInUrl: string): string {
    try {
      const u = new URL(companyLinkedInUrl.trim());
      const companyMatch = u.pathname.match(/^\/company\/([^/]+)/i);
      if (companyMatch) {
        u.pathname = `/company/${companyMatch[1]}/about`;
        u.search = "";
        u.hash = "";
        return u.href;
      }
      let path = u.pathname.replace(/\/+$/, "");
      if (!/\/about$/i.test(path)) {
        path = `${path}/about`;
      }
      u.pathname = path;
      u.search = "";
      u.hash = "";
      return u.href;
    } catch {
      const companyMatch = companyLinkedInUrl
        .trim()
        .match(/\/company\/([^/]+)/i);
      if (companyMatch) {
        return `https://www.linkedin.com/company/${companyMatch[1]}/about`;
      }
      const t = companyLinkedInUrl.trim().replace(/\/+$/, "");
      return /\/about$/i.test(t) ? t : `${t}/about`;
    }
  }

  private toLinkedInRecentActivityUrl(profileUrl: string): string {
    try {
      const u = new URL(profileUrl.trim());
      let path = u.pathname.replace(/\/+$/, "");
      if (!/\/recent-activity\/all$/i.test(path)) {
        path = `${path}/recent-activity/all`;
      }
      u.pathname = path;
      return u.href;
    } catch {
      const t = profileUrl.trim().replace(/\/+$/, "");
      return /\/recent-activity\/all$/i.test(t)
        ? t
        : `${t}/recent-activity/all`;
    }
  }

  private toLinkedInSearchPageUrl(searchUrl: string, pageNum: number): string {
    try {
      const u = new URL(searchUrl.trim());
      if (pageNum > 1) {
        u.searchParams.set("page", String(pageNum));
      } else {
        u.searchParams.delete("page");
      }
      return u.href;
    } catch {
      if (pageNum <= 1) {
        return searchUrl.trim();
      }
      const sep = searchUrl.includes("?") ? "&" : "?";
      return `${searchUrl.trim()}${sep}page=${pageNum}`;
    }
  }

  private normalizeLinkedInCompanyUrl(rawUrl: string): string | null {
    try {
      const u = new URL(rawUrl.trim());
      const match = u.pathname.match(/^\/company\/([^/]+)/i);
      if (!match) {
        return null;
      }
      u.pathname = `/company/${match[1]}`;
      u.search = "";
      u.hash = "";
      return u.href.replace(/\/+$/, "");
    } catch {
      const match = rawUrl.trim().match(/\/company\/([^/?#]+)/i);
      if (!match) {
        return null;
      }
      return `https://www.linkedin.com/company/${match[1]}`;
    }
  }

  private normalizeLinkedInProfileUrl(rawUrl: string): string | null {
    try {
      const u = new URL(rawUrl.trim());
      const match = u.pathname.match(/^\/in\/([^/]+)/i);
      if (!match) {
        return null;
      }
      u.pathname = `/in/${match[1]}`;
      u.search = "";
      u.hash = "";
      return u.href.replace(/\/+$/, "");
    } catch {
      const match = rawUrl.trim().match(/\/in\/([^/?#]+)/i);
      if (!match) {
        return null;
      }
      return `https://www.linkedin.com/in/${match[1]}`;
    }
  }

  private parseNorthAmericaHeadquarters(location: string): boolean {
    const text = location.replace(/\s+/g, " ").trim();
    const lower = text.toLowerCase();
    if (/\bcanada\b/.test(lower)) {
      return true;
    }
    if (/\bunited states\b/.test(lower) || /\b(u\.?\s?s\.?\s?a\.?)\b/.test(lower)) {
      return true;
    }
    if (/(,\s*|\b)(us|usa)\s*$/i.test(text)) {
      return true;
    }
    const canadianProvinces =
      /\b(on|ontario|qc|quebec|bc|british columbia|ab|alberta|mb|manitoba|sk|saskatchewan|ns|nova scotia|nb|new brunswick|nl|newfoundland|pe|prince edward island|nt|northwest territories|nu|nunavut|yt|yukon)\b/i;
    if (canadianProvinces.test(text) && !/\b(california|colorado|connecticut)\b/i.test(lower)) {
      return true;
    }
    const usStateSuffix =
      /,\s*(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia)\s*$/i;
    return usStateSuffix.test(text);
  }

  private async readLinkedInContentSearchPosts(
    page: Page,
  ): Promise<LinkedInContentSearchPostCandidate[]> {
    return await page.evaluate(() => {
      const normalize = (t: string) => t.replace(/\s+/g, " ").trim();
      const posts: Array<{
        companyUrl: string;
        companyName: string;
        postContent: string;
        postKey: string;
        authorProfileUrl?: string;
      }> = [];
      const seenKeys = new Set<string>();

      const normalizeCompanyUrl = (rawUrl: string): string | null => {
        try {
          const u = new URL(rawUrl.trim());
          const match = u.pathname.match(/^\/company\/([^/]+)/i);
          if (!match) {
            return null;
          }
          u.pathname = `/company/${match[1]}`;
          u.search = "";
          u.hash = "";
          return u.href.replace(/\/+$/, "");
        } catch {
          const match = rawUrl.trim().match(/\/company\/([^/?#]+)/i);
          return match
            ? `https://www.linkedin.com/company/${match[1]}`
            : null;
        }
      };

      const normalizeProfileUrl = (rawUrl: string): string | null => {
        try {
          const u = new URL(rawUrl.trim());
          const match = u.pathname.match(/^\/in\/([^/]+)/i);
          if (!match) {
            return null;
          }
          u.pathname = `/in/${match[1]}`;
          u.search = "";
          u.hash = "";
          return u.href.replace(/\/+$/, "");
        } catch {
          const match = rawUrl.trim().match(/\/in\/([^/?#]+)/i);
          return match ? `https://www.linkedin.com/in/${match[1]}` : null;
        }
      };

      const findAuthorAnchor = (
        listItem: Element,
      ): HTMLAnchorElement | null => {
        const anchors = Array.from(
          listItem.querySelectorAll('a[href*="/company/"], a[href*="/in/"]'),
        ) as HTMLAnchorElement[];
        for (const anchor of anchors) {
          const href = anchor.href || "";
          if (href.includes("/company/") || href.includes("/in/")) {
            return anchor;
          }
        }
        return null;
      };

      document.querySelectorAll('div[role="listitem"]').forEach((listItem) => {
        const authorAnchor = findAuthorAnchor(listItem);
        if (!authorAnchor?.href) {
          return;
        }

        const postContent = normalize(listItem.textContent || "");
        if (!postContent) {
          return;
        }

        const authorName =
          normalize(authorAnchor.getAttribute("aria-label") || "") ||
          normalize(authorAnchor.textContent || "") ||
          "LinkedIn member";

        const companyUrl = normalizeCompanyUrl(authorAnchor.href);
        if (companyUrl) {
          const postKey = `${companyUrl}::${postContent.slice(0, 200)}`;
          if (seenKeys.has(postKey)) {
            return;
          }
          seenKeys.add(postKey);
          posts.push({
            companyUrl,
            companyName: authorName,
            postContent,
            postKey,
          });
          return;
        }

        const profileUrl = normalizeProfileUrl(authorAnchor.href);
        if (!profileUrl) {
          return;
        }

        const postKey = `${profileUrl}::${postContent.slice(0, 200)}`;
        if (seenKeys.has(postKey)) {
          return;
        }
        seenKeys.add(postKey);
        posts.push({
          companyUrl: "",
          companyName: authorName,
          postContent,
          postKey,
          authorProfileUrl: profileUrl,
        });
      });

      return posts;
    });
  }

  private async resolveLinkedInContentSearchPostCompanies(
    browser: Browser | null,
    posts: LinkedInContentSearchPostCandidate[],
    credentials?: LinkedInAuthCredentials,
  ): Promise<LinkedInContentSearchPostCandidate[]> {
    const resolved: LinkedInContentSearchPostCandidate[] = [];
    const profilePage = browser ? await browser.newPage() : null;

    try {
      for (const post of posts) {
        if (post.companyUrl) {
          resolved.push(post);
          continue;
        }
        if (!post.authorProfileUrl || !profilePage) {
          continue;
        }

        const company = await this.resolveLinkedInCompanyFromProfileExperience(
          profilePage,
          post.authorProfileUrl,
          credentials,
        );
        if (!company) {
          this.logger.log(
            `[linkedin] could not resolve company from profile ${post.authorProfileUrl}`,
          );
          continue;
        }

        resolved.push({
          companyUrl: company.companyUrl,
          companyName: company.companyName,
          postContent: post.postContent,
          postKey: `${company.companyUrl}::${post.postContent.slice(0, 200)}`,
        });
      }
    } finally {
      await profilePage?.close().catch(() => undefined);
    }

    return resolved;
  }

  /**
   * Opens a LinkedIn profile, scrolls to Experience, and returns the first
   * company link in that section.
   */
  private async resolveLinkedInCompanyFromProfileExperience(
    page: Page,
    profileUrl: string,
    credentials?: LinkedInAuthCredentials,
  ): Promise<{ companyUrl: string; companyName: string } | null> {
    const normalizedProfile = this.normalizeLinkedInProfileUrl(profileUrl);
    if (!normalizedProfile) {
      return null;
    }

    await page.goto(normalizedProfile, {
      waitUntil: "domcontentloaded",
      timeout: LINKEDIN_NAVIGATION_TIMEOUT_MS,
    });
    await this.humanPause(800, 1600);

    const sessionReady = await this.ensureLinkedInSession(
      page,
      credentials,
      normalizedProfile,
    );
    if (!sessionReady) {
      return null;
    }

    await this.scrollToLinkedInProfileExperienceSection(page);
    await this.humanPause(400, 900);

    return await this.readLinkedInExperienceCompanyLink(page);
  }

  private async scrollToLinkedInProfileExperienceSection(
    page: Page,
  ): Promise<boolean> {
    const initiallyVisible = await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll("h2")).find((h2) =>
        /experience/i.test(h2.textContent || ""),
      );
      if (!heading) {
        return false;
      }
      heading.scrollIntoView({ block: "center", inline: "nearest" });
      return true;
    });
    if (initiallyVisible) {
      return true;
    }

    for (let round = 0; round < 10; round++) {
      await page.evaluate(() => {
        window.scrollBy(0, Math.floor(window.innerHeight * 0.65));
      });
      await this.humanPause(350, 700);

      const found = await page.evaluate(() => {
        const heading = Array.from(document.querySelectorAll("h2")).find((h2) =>
          /experience/i.test(h2.textContent || ""),
        );
        if (!heading) {
          return false;
        }
        heading.scrollIntoView({ block: "center", inline: "nearest" });
        return true;
      });
      if (found) {
        return true;
      }
    }

    return false;
  }

  private async readLinkedInExperienceCompanyLink(
    page: Page,
  ): Promise<{ companyUrl: string; companyName: string } | null> {
    return await page.evaluate(() => {
      const normalize = (t: string) => t.replace(/\s+/g, " ").trim();

      const normalizeCompanyUrl = (rawUrl: string): string | null => {
        try {
          const u = new URL(rawUrl.trim());
          const match = u.pathname.match(/^\/company\/([^/]+)/i);
          if (!match) {
            return null;
          }
          u.pathname = `/company/${match[1]}`;
          u.search = "";
          u.hash = "";
          return u.href.replace(/\/+$/, "");
        } catch {
          const match = rawUrl.trim().match(/\/company\/([^/?#]+)/i);
          return match
            ? `https://www.linkedin.com/company/${match[1]}`
            : null;
        }
      };

      const heading = Array.from(document.querySelectorAll("h2")).find((h2) =>
        /experience/i.test(h2.textContent || ""),
      );
      if (!heading) {
        return null;
      }

      const section =
        heading.closest("section") ??
        heading.parentElement?.closest("section") ??
        heading.parentElement;
      if (!section) {
        return null;
      }

      const anchor = section.querySelector(
        'a[href*="/company/"]',
      ) as HTMLAnchorElement | null;
      if (!anchor?.href) {
        return null;
      }

      const companyUrl = normalizeCompanyUrl(anchor.href);
      if (!companyUrl) {
        return null;
      }

      const companyName =
        normalize(anchor.getAttribute("aria-label") || "") ||
        normalize(anchor.textContent || "") ||
        "LinkedIn company";

      return { companyUrl, companyName };
    });
  }

  private async scrollLinkedInContentSearchResults(page: Page): Promise<boolean> {
    const before = await this.readLinkedInContentSearchScrollMetrics(page);

    const didScroll = await page.evaluate(() => {
      const workspace = document.querySelector("main#workspace");
      if (!(workspace instanceof HTMLElement)) {
        return false;
      }

      const maxScroll = workspace.scrollHeight - workspace.clientHeight;
      const beforeTop = workspace.scrollTop;
      const step = Math.max(
        200,
        Math.min(
          Math.floor(workspace.clientHeight * 0.75),
          Math.max(0, maxScroll - beforeTop),
        ),
      );
      workspace.scrollTop = Math.min(maxScroll, beforeTop + step);
      workspace.dispatchEvent(new Event("scroll", { bubbles: true }));

      if (workspace.scrollTop > beforeTop + 1) {
        return true;
      }

      const r = workspace.getBoundingClientRect();
      workspace.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height * 0.65,
          deltaY: Math.max(280, Math.floor(r.height * 0.55)),
          deltaMode: 0,
        }),
      );
      return workspace.scrollTop > beforeTop + 1;
    });

    if (!didScroll) {
      const wheelTarget = await page.evaluate(() => {
        const workspace = document.querySelector("main#workspace");
        if (!(workspace instanceof HTMLElement)) {
          return null;
        }
        const r = workspace.getBoundingClientRect();
        return {
          x: r.left + r.width / 2,
          y: r.top + r.height * 0.65,
        };
      });
      if (wheelTarget) {
        await page.mouse.move(wheelTarget.x, wheelTarget.y);
        await page.mouse.wheel({ deltaY: 720 });
      }
    }

    await this.humanPause(450, 900);
    await page
      .waitForNetworkIdle({ idleTime: 350, timeout: 2800 })
      .catch(() => undefined);

    const after = await this.readLinkedInContentSearchScrollMetrics(page);
    return (
      after.scrollHeight > before.scrollHeight ||
      after.scrollTop > before.scrollTop + 1
    );
  }

  private async readLinkedInContentSearchScrollMetrics(
    page: Page,
  ): Promise<{ scrollHeight: number; scrollTop: number }> {
    return await page.evaluate(() => {
      const workspace = document.querySelector("main#workspace");
      if (workspace instanceof HTMLElement) {
        return {
          scrollHeight: workspace.scrollHeight,
          scrollTop: workspace.scrollTop,
        };
      }
      return { scrollHeight: 0, scrollTop: 0 };
    });
  }

  private async readLinkedInCompanyHeadquartersLocation(
    page: Page,
  ): Promise<string | null> {
    return await page.evaluate(() => {
      const normalize = (t: string) => t.replace(/\s+/g, " ").trim();
      const headings = Array.from(document.querySelectorAll("h3"));
      for (const h3 of headings) {
        if (!/headquarters/i.test(h3.textContent || "")) {
          continue;
        }
        const locationEl = h3.parentElement?.nextElementSibling;
        if (locationEl) {
          const text = normalize(locationEl.textContent || "");
          if (text) {
            return text;
          }
        }
      }
      return null;
    });
  }

  private async clickLinkedInContentPostControlMenu(
    page: Page,
    companyUrl: string,
    contentSnippet: string,
  ): Promise<boolean> {
    const companySlug = companyUrl.match(/\/company\/([^/?#]+)/i)?.[1] ?? "";
    const snippet = contentSnippet.trim().slice(0, 80);

    return await page.evaluate(
      (slug, snippetText) => {
        const normalize = (t: string) => t.replace(/\s+/g, " ").trim();

        const openMenuInContainer = (container: HTMLElement | null): boolean => {
          for (let depth = 0; depth < 10 && container; depth++) {
            const menuBtn = container.querySelector<HTMLElement>(
              'button[aria-label^="Open control menu for"]',
            );
            if (menuBtn) {
              menuBtn.scrollIntoView({ block: "center", inline: "nearest" });
              menuBtn.click();
              return true;
            }
            container = container.parentElement;
          }
          return false;
        };

        const anchors = Array.from(
          document.querySelectorAll(
            'a[href*="/company/"], a[href*="linkedin.com/company"]',
          ),
        ) as HTMLAnchorElement[];

        for (const anchor of anchors) {
          if (slug && !anchor.href.includes(`/company/${slug}`)) {
            continue;
          }
          const listItem = anchor.closest('div[role="listitem"]');
          const container = listItem ?? anchor.parentElement?.parentElement;
          const text = normalize(container?.textContent || "");
          if (snippetText && !text.includes(snippetText.slice(0, 40))) {
            continue;
          }

          if (openMenuInContainer(container as HTMLElement | null)) {
            return true;
          }
        }

        const listItems = Array.from(
          document.querySelectorAll('div[role="listitem"]'),
        );
        for (const listItem of listItems) {
          const text = normalize(listItem.textContent || "");
          if (snippetText && !text.includes(snippetText.slice(0, 40))) {
            continue;
          }
          if (openMenuInContainer(listItem as HTMLElement)) {
            return true;
          }
        }

        return false;
      },
      companySlug,
      snippet,
    );
  }

  private async copyLinkedInPostLinkFromMenu(page: Page): Promise<string | null> {
    await page
      .waitForSelector('[role="menu"], [role="menuitem"]', { timeout: 8_000 })
      .catch(() => undefined);

    const clicked = await page.evaluate(() => {
      const items = Array.from(
        document.querySelectorAll('[role="menuitem"], li, span, div'),
      ) as HTMLElement[];
      for (const item of items) {
        const text = (item.textContent || "").replace(/\s+/g, " ").trim();
        if (/copy link to post/i.test(text)) {
          item.click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) {
      return null;
    }

    await this.humanPause(400, 900);

    try {
      const context = page.browser().defaultBrowserContext();
      await context.overridePermissions(page.url(), ["clipboard-read"]);
    } catch {
      // clipboard permission may be unavailable in some environments
    }

    const fromClipboard = await page
      .evaluate(async () => {
        try {
          return await navigator.clipboard.readText();
        } catch {
          return "";
        }
      })
      .catch(() => "");

    if (fromClipboard?.includes("linkedin.com")) {
      return fromClipboard.trim();
    }

    return await page.evaluate(() => {
      const links = Array.from(
        document.querySelectorAll('a[href*="linkedin.com/feed/update"]'),
      ) as HTMLAnchorElement[];
      return links[0]?.href?.split("?")[0] ?? null;
    });
  }

  private async readLinkedInSearchCompanyListProfiles(
    page: Page,
  ): Promise<LinkedInCompanyProfile[]> {
    return await page.evaluate(() => {
      const normalize = (t: string) => t.replace(/\s+/g, " ").trim();
      const companies: Array<{ name: string; companyUrl: string }> = [];
      const seenUrls = new Set<string>();

      const normalizeCompanyUrl = (rawUrl: string): string | null => {
        try {
          const u = new URL(rawUrl.trim());
          const match = u.pathname.match(/^\/company\/([^/]+)/i);
          if (!match) {
            return null;
          }
          u.pathname = `/company/${match[1]}`;
          u.search = "";
          u.hash = "";
          return u.href.replace(/\/+$/, "");
        } catch {
          const match = rawUrl.trim().match(/\/company\/([^/?#]+)/i);
          return match
            ? `https://www.linkedin.com/company/${match[1]}`
            : null;
        }
      };

      const primaryContent = document.querySelector(
        '[aria-label="Primary content"]',
      );
      if (!primaryContent) {
        return companies;
      }

      primaryContent
        .querySelectorAll('a[href*="/company/"]')
        .forEach((node) => {
          const anchor = node as HTMLAnchorElement;
          if (!anchor.href) {
            return;
          }
          const companyUrl = normalizeCompanyUrl(anchor.href);
          if (!companyUrl || seenUrls.has(companyUrl)) {
            return;
          }
          seenUrls.add(companyUrl);

          const name =
            normalize(anchor.getAttribute("aria-label") || "") ||
            normalize(anchor.textContent || "") ||
            "LinkedIn company";

          companies.push({ name, companyUrl });
        });

      return companies;
    });
  }

  private async readLinkedInSearchPeopleListProfiles(
    page: Page,
  ): Promise<LinkedInPersonProfile[]> {
    return await page.evaluate(() => {
      const normalize = (t: string) => t.replace(/\s+/g, " ").trim();
      const profiles: Array<{
        name: string;
        position: string;
        profileUrl: string;
      }> = [];
      const seenUrls = new Set<string>();

      document.querySelectorAll('[role="list"]').forEach((list) => {
        list.querySelectorAll("li").forEach((item) => {
          const anchor = item.querySelector(
            'a[href*="/in/"]',
          ) as HTMLAnchorElement | null;
          if (!anchor?.href) {
            return;
          }
          let profileUrl = anchor.href.split("?")[0];
          if (!profileUrl.includes("/in/") || seenUrls.has(profileUrl)) {
            return;
          }
          seenUrls.add(profileUrl);

          const name =
            normalize(anchor.getAttribute("aria-label") || "") ||
            normalize(anchor.textContent || "") ||
            "LinkedIn member";

          const subtitle = item.querySelector(
            '.entity-result__primary-subtitle, .entity-result__secondary-subtitle, [data-test-id="subline"]',
          );
          const position = subtitle
            ? normalize(subtitle.textContent || "")
            : "";

          profiles.push({ name, position, profileUrl });
        });
      });

      return profiles;
    });
  }

  private async scrollLinkedInSearchResultsHuman(page: Page): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, Math.floor(window.innerHeight * 0.55));
      });
      await this.humanPause(350, 750);
    }
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await this.humanPause(200, 450);
  }

  private async navigateLinkedInSearchNextPage(
    page: Page,
    searchUrl: string,
    nextPageNum: number,
  ): Promise<boolean> {
    const clicked = await page.evaluate(() => {
      const nextBtn = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Next"], button[aria-label="Next page"]',
      );
      if (!nextBtn || nextBtn.disabled) {
        return false;
      }
      nextBtn.scrollIntoView({ block: "center", inline: "nearest" });
      nextBtn.click();
      return true;
    });

    if (clicked) {
      await page
        .waitForNavigation({
          waitUntil: "networkidle2",
          timeout: LINKEDIN_NAVIGATION_TIMEOUT_MS,
        })
        .catch(() => undefined);
      await this.humanPause(600, 1200);
      return true;
    }

    const nextUrl = this.toLinkedInSearchPageUrl(searchUrl, nextPageNum);
    await page.goto(nextUrl, {
      waitUntil: "networkidle2",
      timeout: LINKEDIN_NAVIGATION_TIMEOUT_MS,
    });
    await this.humanPause(700, 1300);
    return true;
  }

  private async linkedinPageRequiresAuth(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
      const body = (document.body?.innerText || "").toLowerCase();
      const url = window.location.href.toLowerCase();
      return (
        url.includes("/login") ||
        url.includes("/authwall") ||
        url.includes("/checkpoint") ||
        body.includes("sign in to linkedin") ||
        body.includes("join linkedin")
      );
    });
  }

  /**
   * Logs in with connector credentials when LinkedIn shows a login/auth wall,
   * then returns to `returnUrl` before continuing the scrape.
   */
  private async ensureLinkedInSession(
    page: Page,
    credentials: LinkedInAuthCredentials | undefined,
    returnUrl: string,
  ): Promise<boolean> {
    if (!(await this.linkedinPageRequiresAuth(page))) {
      return true;
    }
    if (!credentials?.username?.trim() || !credentials?.password?.trim()) {
      this.logger.log("[linkedin] auth required but no credentials provided");
      return false;
    }

    const loggedIn = await this.loginToLinkedIn(page, credentials);
    if (!loggedIn) {
      return false;
    }

    await page.goto(returnUrl, {
      waitUntil: "networkidle2",
      timeout: LINKEDIN_NAVIGATION_TIMEOUT_MS,
    });
    await this.humanPause(800, 1600);

    if (await this.linkedinPageRequiresAuth(page)) {
      this.logger.warn("[linkedin] still on auth page after login attempt");
      return false;
    }
    return true;
  }

  private async loginToLinkedIn(
    page: Page,
    credentials: LinkedInAuthCredentials,
  ): Promise<boolean> {
    const url = page.url().toLowerCase();
    if (!url.includes("/login") && !url.includes("/authwall")) {
      await page.goto("https://www.linkedin.com/login", {
        waitUntil: "networkidle2",
        timeout: LINKEDIN_NAVIGATION_TIMEOUT_MS,
      });
      await this.humanPause(800, 1600);
    }

    const usernameSelector =
      '#username, input[name="session_key"], input[autocomplete="username"]';
    const passwordSelector =
      '#password, input[name="session_password"], input[autocomplete="current-password"]';

    try {
      await page.waitForSelector(usernameSelector, { timeout: 20_000 });
      await this.typeIntoSelector(page, usernameSelector, credentials.username);
      await this.humanPause(200, 500);
      await this.typeIntoSelector(page, passwordSelector, credentials.password);
      await this.humanPause(300, 700);

      const submit = await page.$(
        'button[type="submit"], input[type="submit"], button[data-litms-control-urn="login-submit"]',
      );
      if (!submit) {
        this.logger.warn("[linkedin] login submit button not found");
        return false;
      }
      try {
        const clicked = await this.realMouseClick(page, submit);
        if (!clicked) {
          await submit.click();
        }
      } finally {
        await submit.dispose().catch(() => undefined);
      }

      await page
        .waitForNavigation({
          waitUntil: "networkidle2",
          timeout: LINKEDIN_NAVIGATION_TIMEOUT_MS,
        })
        .catch(() => undefined);
      await this.humanPause(1200, 2200);

      if (page.url().toLowerCase().includes("/checkpoint")) {
        this.logger.warn(
          "[linkedin] login reached security checkpoint; manual verification may be required",
        );
        return false;
      }

      return !(await this.linkedinPageRequiresAuth(page));
    } catch (error) {
      this.logger.warn(`[linkedin] login failed: ${(error as Error).message}`);
      return false;
    }
  }

  private async typeIntoSelector(
    page: Page,
    selector: string,
    value: string,
  ): Promise<void> {
    const rawInput = await page.$(selector);
    if (!rawInput) {
      throw new Error(`No input matching selector: ${selector}`);
    }
    const input = (rawInput as unknown) as ElementHandle<HTMLInputElement>;
    try {
      await input.evaluate((el) =>
        (el as HTMLInputElement).scrollIntoView({
          block: "center",
          inline: "nearest",
        }),
      );
      await this.humanPause(60, 180);
      const clicked = await this.realMouseClick(page, rawInput);
      if (!clicked) {
        await rawInput.click();
      }
      await this.humanPause(150, 400);
      await input.evaluate((el) => {
        const inp = el as HTMLInputElement;
        inp.value = "";
      });
      await this.typeTextHumanInput(input, value);
      await input.evaluate((el) => {
        const inp = el as HTMLInputElement;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      });
    } finally {
      await rawInput.dispose().catch(() => undefined);
    }
  }

  private async readLinkedInAssociatedMembersCount(
    page: Page,
  ): Promise<number | null> {
    return await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll("h2"));
      for (const h of headings) {
        const text = (h.textContent || "").replace(/\s+/g, " ").trim();
        const match = text.match(/([\d,]+)\s+associated\s+members/i);
        if (match) {
          const n = Number.parseInt(match[1].replace(/,/g, ""), 10);
          if (Number.isFinite(n)) {
            return n;
          }
        }
      }
      return null;
    });
  }

  private async readLinkedInPeopleYouMayKnowProfiles(
    page: Page,
  ): Promise<LinkedInPersonProfile[]> {
    return await page.evaluate(() => {
      const normalize = (t: string) => t.replace(/\s+/g, " ").trim();
      const profileUrlPrefix = "https://www.linkedin.com/in/";

      const normalizeProfileUrl = (href: string | null | undefined) => {
        if (!href) {
          return null;
        }
        const profileUrl = href.split("?")[0].replace(/\/$/, "");
        return profileUrl.startsWith(profileUrlPrefix) ? profileUrl : null;
      };

      const readTextLines = (root: Element) =>
        Array.from(root.querySelectorAll("span, div, p, a"))
          .map((el) => normalize(el.textContent || ""))
          .filter(
            (text) =>
              text.length > 0 &&
              !/^(connect|follow|message|view profile)$/i.test(text),
          );

      const readPosition = (item: Element, name: string) => {
        const explicitPositions = Array.from(
          item.querySelectorAll(
            '.org-people-profile-card__profile-title, .artdeco-entity-lockup__subtitle, [class*="subtitle"]',
          ),
        )
          .map((el) => normalize(el.textContent || ""))
          .filter((text) => text.length > 0);
        if (explicitPositions.length > 0) {
          return [...new Set(explicitPositions)].join(" · ");
        }

        const lines = readTextLines(item).filter(
          (text) => text !== name && text !== "LinkedIn member",
        );
        return [...new Set(lines)].slice(0, 2).join(" · ");
      };

      const readPeopleListItems = () => {
        const heading = Array.from(document.querySelectorAll("h2")).find((h) =>
          /people you may know/i.test(h.textContent || ""),
        );
        const section = heading?.closest("section") || heading?.parentElement;
        const scopedItems = section
          ? Array.from(section.querySelectorAll("ul > li"))
          : [];
        return scopedItems.length > 0
          ? scopedItems
          : Array.from(document.querySelectorAll("ul > li"));
      };

      const byProfile = new Map<
        string,
        { name: string; position: string; profileUrl?: string | null }
      >();

      for (const item of readPeopleListItems()) {
        const anchor = item.querySelector(
          `a[href^="${profileUrlPrefix}"]`,
        ) as HTMLAnchorElement | null;
        const profileUrl = normalizeProfileUrl(anchor?.href);

        const name =
          normalize(anchor?.getAttribute("aria-label") || "") ||
          normalize(anchor?.textContent || "") ||
          "LinkedIn member";
        const position = readPosition(item, name);
        if (!profileUrl && !position) {
          continue;
        }

        const profileKey = profileUrl ?? `${name}|${position}`;
        const existing = byProfile.get(profileKey);
        if (existing) {
          if (!existing.name && name) {
            existing.name = name;
          } else if (name.length > existing.name.length) {
            existing.name = name;
          }
          if (!existing.position && position) {
            existing.position = position;
          }
          continue;
        }

        byProfile.set(profileKey, {
          name,
          position,
          ...(profileUrl ? { profileUrl } : {}),
        });
      }

      return Array.from(byProfile.values());
    });
  }

  private async clickLinkedInShowMoreResults(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button"),
      );
      const btn = buttons.find((b) =>
        /show more results/i.test((b.textContent || "").trim()),
      );
      if (!btn || btn.disabled) {
        return false;
      }
      btn.scrollIntoView({ block: "center", inline: "nearest" });
      btn.click();
      return true;
    });
  }

  private async scrollLinkedInFiniteScroll(
    page: Page,
  ): Promise<{ atEnd: boolean }> {
    return await page.evaluate(() => {
      const scroller =
        document.querySelector(".scaffold-finite-scroll") instanceof HTMLElement
          ? (document.querySelector(".scaffold-finite-scroll") as HTMLElement)
          : null;
      if (!scroller) {
        window.scrollBy(0, Math.floor(window.innerHeight * 0.75));
        return { atEnd: false };
      }
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      const before = scroller.scrollTop;
      const step = Math.max(200, Math.floor(scroller.clientHeight * 0.7));
      scroller.scrollTop = Math.min(maxScroll, before + step);
      const atEnd = scroller.scrollTop >= maxScroll - 4;
      return { atEnd: atEnd && scroller.scrollTop <= before + 2 };
    });
  }

  /**
   * Google Maps frequently changes layout; a fixed `width: 408px` wrapper is often
   * not the scrollable node, so `scrollTop` never moves. We resolve `[role="feed"]`
   * or the scrollable ancestor of a result card, then use `scrollTop` and a wheel
   * fallback; if nothing scrolls, fall back to `window.scrollBy`.
   *
   * Returns `endOfList` when the feed shows Google’s end-of-list copy, or the pane is
   * at the bottom with no further movement (nothing more to load).
   */
  private async scrollGoogleMapsResultsFeed(
    page: Page,
  ): Promise<{ endOfList: boolean }> {
    const { endOfList, didScroll } = await page.evaluate(() => {
      const endOfListFromText = (node: HTMLElement | null) => {
        if (!node) {
          return false;
        }
        const t = (node.innerText || "")
          .replace(/\s+/g, " ")
          .toLowerCase()
          .normalize("NFKC");
        if (!t) {
          return false;
        }
        return (
          t.includes("end of the list") ||
          t.includes("reached the end") ||
          t.includes("you've reached the end") ||
          t.includes("bottom of the list")
        );
      };

      const overflowYScrollable = (el: HTMLElement) =>
        /^(auto|scroll|overlay)$/.test(getComputedStyle(el).overflowY);

      const findScroller = (): HTMLElement | null => {
        const feed = document.querySelector('[role="feed"]');
        if (feed instanceof HTMLElement) {
          if (
            feed.scrollHeight > feed.clientHeight + 48 &&
            overflowYScrollable(feed)
          ) {
            return feed;
          }
        }
        const article = document.querySelector('[role="article"]');
        if (!(article instanceof HTMLElement)) {
          return null;
        }
        let el: HTMLElement | null = article;
        let best: HTMLElement | null = null;
        let bestRoom = 0;
        while (el) {
          const room = el.scrollHeight - el.clientHeight;
          if (room > bestRoom && room > 48 && overflowYScrollable(el)) {
            best = el;
            bestRoom = room;
          }
          el = el.parentElement;
        }
        return best;
      };

      const feed =
        document.querySelector('[role="feed"]') instanceof HTMLElement
          ? (document.querySelector('[role="feed"]') as HTMLElement)
          : null;
      const scroller = findScroller();

      if (endOfListFromText(feed) || endOfListFromText(scroller)) {
        return { endOfList: true, didScroll: false };
      }

      if (!scroller) {
        window.scrollBy(0, Math.floor(window.innerHeight * 0.72));
        return { endOfList: false, didScroll: true };
      }

      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      const before = scroller.scrollTop;
      const atBottomBefore = maxScroll > 8 && before >= maxScroll - 3;

      const step = Math.max(
        160,
        Math.min(
          Math.floor(scroller.clientHeight * 0.78),
          Math.max(0, maxScroll - before),
        ),
      );
      scroller.scrollTop = Math.min(maxScroll, before + step);

      let moved = scroller.scrollTop > before;

      if (!moved) {
        const mid = scroller.scrollTop;
        const r = scroller.getBoundingClientRect();
        const cx = r.left + Math.max(24, r.width * 0.45);
        const cy = r.top + Math.max(24, r.height * 0.35);
        const wheelDelta = Math.max(280, Math.floor(r.height * 0.55));
        scroller.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: cx,
            clientY: cy,
            deltaY: wheelDelta,
            deltaMode: 0,
          }),
        );
        moved = scroller.scrollTop > mid;
      }

      if (endOfListFromText(feed) || endOfListFromText(scroller)) {
        return { endOfList: true, didScroll: moved };
      }

      const atBottomAfter =
        maxScroll > 8 && scroller.scrollTop >= maxScroll - 3;
      if (atBottomAfter && !moved && atBottomBefore) {
        return { endOfList: true, didScroll: false };
      }

      if (!moved) {
        window.scrollBy(0, Math.floor(window.innerHeight * 0.72));
        return { endOfList: false, didScroll: true };
      }

      return { endOfList: false, didScroll: true };
    });

    if (didScroll && !endOfList) {
      await page
        .waitForNetworkIdle({ idleTime: 350, timeout: 2800 })
        .catch(() => undefined);
    }

    return { endOfList };
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private async humanPause(minMs: number, maxMs: number): Promise<void> {
    await this.delay(this.randomInt(minMs, maxMs));
  }

  /**
   * Resolves and (lazily) ensures the persistent Chrome user-data-dir for the
   * real browser. Configured via CARLETON_REAL_BROWSER_USER_DATA_DIR. When
   * unset, returns undefined and puppeteer-real-browser uses a fresh temp
   * profile per run (the previous behaviour).
   *
   * In Docker, point this at a path on a mounted volume so Google reCAPTCHA
   * trust cookies survive container restarts.
   */
  private async resolveUserDataDir(): Promise<string | undefined> {
    const configured = process.env.CARLETON_REAL_BROWSER_USER_DATA_DIR?.trim();
    if (!configured) {
      return undefined;
    }
    try {
      await fs.mkdir(configured, { recursive: true });
      this.logger.log(
        `[real-browser] using persistent profile at ${configured}`,
      );
      return configured;
    } catch (e) {
      this.logger.warn(
        `[real-browser] could not create user-data-dir ${configured}: ${
          (e as Error).message
        }; falling back to ephemeral profile`,
      );
      return undefined;
    }
  }

  /**
   * Visit google.com briefly so Google's invisible reCAPTCHA client can set
   * its trust cookies against this Chrome profile. Doing this once at the
   * start of a flow can be the difference between a 500 and a 200 on a fresh
   * datacenter-IP session, because reCAPTCHA's score model leans heavily on
   * "is this profile a returning Google user". Failures are non-fatal — if
   * the warmup itself fails we just continue on to the form.
   */
  private async prewarmGoogle(page: Page): Promise<void> {
    try {
      await page.goto(PREWARM_URL, {
        waitUntil: "networkidle2",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await this.humanPause(400, 900);

      // A few human-ish mouse movements; reCAPTCHA also looks at pointer
      // entropy when scoring the session.
      const viewport = await page
        .evaluate(() => ({
          w: window.innerWidth || 1280,
          h: window.innerHeight || 720,
        }))
        .catch(() => ({ w: 1280, h: 720 }));
      for (let i = 0; i < 3; i++) {
        const x = this.randomInt(50, Math.max(100, viewport.w - 50));
        const y = this.randomInt(50, Math.max(100, viewport.h - 50));
        await page.mouse.move(x, y, { steps: this.randomInt(8, 18) });
        await this.humanPause(120, 350);
      }
      this.logger.log("[real-browser] prewarm visit to google.com complete");
    } catch (e) {
      this.logger.warn(
        `[real-browser] google.com prewarm failed (continuing): ${
          (e as Error).message
        }`,
      );
    }
  }

  private async typeTextHumanPage(page: Page, text: string): Promise<void> {
    for (const ch of text) {
      await page.keyboard.type(ch);
      await this.delay(this.randomInt(60, 180));
    }
  }

  private async typeTextHumanInput(
    input: ElementHandle<HTMLInputElement>,
    value: string,
  ): Promise<void> {
    for (const ch of value) {
      await input.type(ch);
      await this.delay(this.randomInt(60, 180));
    }
  }

  private async clickAddressOption(page: Page, address: string): Promise<void> {
    const trimmed = address.trim();
    if (!trimmed) {
      throw new Error("Address is empty");
    }
    const prefix = trimmed.slice(0, 6);
    if (prefix) {
      await this.typeTextHumanPage(page, prefix);
    }
    await this.humanPause(150, 400);

    await page.waitForSelector("ul li, [role='listbox'] [role='option']", {
      timeout: 12_000,
    });

    const want = trimmed.toLowerCase();
    const itemHandles = await page.$$(
      "ul li, [role='listbox'] [role='option']",
    );
    try {
      let matchedIndex = -1;
      for (let i = 0; i < itemHandles.length; i++) {
        const text = await itemHandles[i].evaluate((el) =>
          (el.textContent || "").trim().toLowerCase(),
        );
        if (text && (text.includes(want) || want.includes(text))) {
          matchedIndex = i;
          break;
        }
      }
      if (matchedIndex === -1) {
        throw new Error(`No dropdown option matched address: ${address}`);
      }

      const itemHandle = itemHandles[matchedIndex];
      await itemHandle.evaluate((el) =>
        (el as HTMLElement).scrollIntoView({
          block: "nearest",
          inline: "nearest",
        }),
      );
      await this.humanPause(80, 200);

      const clicked = await this.realMouseClick(page, itemHandle);
      if (!clicked) {
        this.logger.warn(
          "Real-mouse click on address option failed; falling back to keyboard selection",
        );
        for (let i = 0; i <= matchedIndex; i++) {
          await page.keyboard.press("ArrowDown");
          await this.humanPause(40, 110);
        }
        await page.keyboard.press("Enter");
      }
      await this.humanPause(150, 400);
    } finally {
      await Promise.all(
        itemHandles.map((h) => h.dispose().catch(() => undefined)),
      );
    }
  }

  private async findAddressInput(
    page: Page,
  ): Promise<ElementHandle<HTMLInputElement> | null> {
    const handles = await page.$$('form input:not([type="hidden"])');
    let chosen: ElementHandle<Element> | null = null;
    for (const h of handles) {
      if (chosen) {
        await h.dispose().catch(() => undefined);
        continue;
      }
      const info = await h.evaluate((n) => {
        const inp = n as HTMLInputElement;
        return { name: inp.name || "", type: (inp.type || "").toLowerCase() };
      });
      const isTextish = info.type === "text" || info.type === "search";
      const isAddressName = !info.name || info.name === "address";
      if (isTextish && isAddressName) {
        chosen = h;
      } else {
        await h.dispose().catch(() => undefined);
      }
    }
    return chosen as ElementHandle<HTMLInputElement> | null;
  }

  private async typeIntoNamedInput(
    page: Page,
    name: string,
    value: string,
  ): Promise<void> {
    const rawInput = await page.$(`form input[name="${name}"]`);
    if (!rawInput) {
      throw new Error(`No form input with name="${name}"`);
    }
    const input = (rawInput as unknown) as ElementHandle<HTMLInputElement>;
    try {
      await input.evaluate((el) =>
        (el as HTMLInputElement).scrollIntoView({
          block: "center",
          inline: "nearest",
        }),
      );
      await this.humanPause(60, 180);

      const clicked = await this.realMouseClick(page, rawInput);
      if (!clicked) {
        await rawInput.click();
      }
      await this.humanPause(150, 400);

      await input.evaluate((el) => {
        const inp = el as HTMLInputElement;
        inp.value = "";
      });

      await this.typeTextHumanInput(input, value);

      await input.evaluate((el) => {
        const inp = el as HTMLInputElement;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
        inp.blur();
      });

      const observed = await input.evaluate(
        (el) => (el as HTMLInputElement).value,
      );
      if (observed === "" && value !== "") {
        this.logger.warn(
          `[form] input "${name}" still empty after typing; forcing value via native setter`,
        );
        await input.evaluate((el, v) => {
          const inp = el as HTMLInputElement;
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value",
          )?.set;
          setter?.call(inp, v);
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
          inp.blur();
        }, value);
      }
    } finally {
      await input.dispose();
    }
  }

  /**
   * Increment a `<input type="number">` to the target value by pressing
   * ArrowUp (the keyboard equivalent of the native spinner's up button),
   * rather than typing the value in. Each press triggers the same input
   * handlers the site would see from a real user clicking the spinner.
   */
  private async incrementNumberInput(
    page: Page,
    name: string,
    target: number,
  ): Promise<void> {
    if (!Number.isFinite(target) || target <= 0) {
      throw new Error(`Invalid target for ${name}: ${target}`);
    }
    const rawInput = await page.$(`form input[name="${name}"]`);
    if (!rawInput) {
      throw new Error(`No form input with name="${name}"`);
    }
    const input = (rawInput as unknown) as ElementHandle<HTMLInputElement>;
    try {
      await input.evaluate((el) =>
        (el as HTMLInputElement).scrollIntoView({
          block: "center",
          inline: "nearest",
        }),
      );
      await this.humanPause(60, 180);

      const clicked = await this.realMouseClick(page, rawInput);
      if (!clicked) {
        await rawInput.click();
      }
      await this.humanPause(150, 400);

      await input.evaluate((el) => {
        const inp = el as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(inp, "");
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await input.focus();

      const maxPresses = target + 5;
      let current = 0;
      for (let i = 0; i < maxPresses; i++) {
        await page.keyboard.press("ArrowUp");
        await this.delay(this.randomInt(70, 180));
        current = await input.evaluate((el) => {
          const v = (el as HTMLInputElement).value;
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        });
        if (current >= target) {
          break;
        }
      }

      if (current !== target) {
        this.logger.warn(
          `[form] input "${name}" reached ${current} after ArrowUp presses (target ${target})`,
        );
      }

      // Force-sync the final value through the prototype's native setter so
      // any framework that monkey-patches HTMLInputElement.prototype.value
      // (React, etc.) definitely picks up the new value. The browser's
      // ArrowUp updates the value at a layer below this setter, which can
      // leave a controlled component's internal state out of sync — that
      // shows up as the field being silently dropped from the submitted
      // payload even though the DOM reads the right value.
      await input.evaluate((el, v) => {
        const inp = el as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(inp, String(v));
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
        inp.blur();
      }, target);
    } finally {
      await input.dispose();
    }
  }

  /**
   * Runs the full form fill flow on whatever registration page is currently
   * loaded. Extracted so the outer flow can re-run it on retry.
   */
  private async fillCarletonParkingForm(
    page: Page,
    input: CarletonParkingRegistrationInput,
  ): Promise<void> {
    await page.waitForSelector("form", { timeout: 20_000 });
    await this.humanPause(100, 300);

    const addressTrigger = await this.findAddressInput(page);
    if (!addressTrigger) {
      throw new Error("Could not locate the address combobox input");
    }
    try {
      await this.humanPause(60, 200);
      await addressTrigger.click();
      await this.humanPause(150, 400);
    } finally {
      await addressTrigger.dispose().catch(() => undefined);
    }

    await this.clickAddressOption(page, input.address);
    await this.humanPause(120, 350);
    await this.logFormState(page, "after address selection");

    await this.typeIntoNamedInput(page, "unit_number", input.unitNumber);
    await this.humanPause(200, 500);
    await this.typeIntoNamedInput(page, "license", input.licensePlate);
    await this.humanPause(200, 500);
    await this.incrementNumberInput(page, "nights", input.numberOfNights);
    await this.humanPause(200, 500);

    await page.evaluate(() => {
      const ae = document.activeElement as HTMLElement | null;
      ae?.blur?.();
    });
    await this.humanPause(250, 600);

    await this.logFormState(page, "before submit");
  }

  /**
   * Clicks the register button, waits for the network to settle, and returns
   * whether the page reached the success URL (`/confirm/...`).
   */
  private async submitAndCheckOutcome(page: Page): Promise<boolean> {
    await this.clickRegisterButton(page);
    await page
      .waitForNetworkIdle({ idleTime: 500, timeout: 5_000 })
      .catch(() => undefined);
    await this.humanPause(500, 1100);
    return page.url().includes("/confirm/");
  }

  /**
   * Reproduces the "click back to registration" recovery a human does after a
   * 500 on this site. Tries to click an in-page link/button matching common
   * "back to registration" wording, falling back to a hard navigation if no
   * link can be found.
   */
  private async returnToRegistrationForm(page: Page): Promise<void> {
    const clicked = await page
      .evaluate(() => {
        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>("a, button"),
        );
        const target = candidates.find((el) => {
          const text = (el.textContent || "").trim().toLowerCase();
          if (!text) return false;
          return (
            text.includes("back to registration") ||
            text.includes("Go Home") ||
            text.includes("try again") ||
            text === "register" ||
            text === "registration"
          );
        });
        if (!target) return false;
        target.click();
        return true;
      })
      .catch(() => false);

    if (clicked) {
      await page
        .waitForNetworkIdle({ idleTime: 500, timeout: 15_000 })
        .catch(() => undefined);
    } else {
      this.logger.debug(
        "[carleton] no 'back to registration' link found; navigating to homepage",
      );
      await page.goto(CARLETON_PARKING_URL, {
        waitUntil: "networkidle2",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
    }
    await this.humanPause(300, 700);
    await page.waitForSelector("form", { timeout: 20_000 });
  }

  private async clickRegisterButton(page: Page): Promise<void> {
    await this.humanPause(80, 260);
    const submit = await page.$(
      'form button[type="submit"], form input[type="submit"]',
    );
    if (!submit) {
      throw new Error("No type=submit control found in the form");
    }
    try {
      await submit.evaluate((el) =>
        (el as HTMLElement).scrollIntoView({
          block: "center",
          inline: "nearest",
        }),
      );
      await this.humanPause(60, 160);
      const clicked = await this.realMouseClick(page, submit);
      if (!clicked) {
        this.logger.warn(
          "Real-mouse click on submit failed; falling back to ElementHandle.click()",
        );
        await submit.click();
      }
    } finally {
      await submit.dispose();
    }
  }

  private async realMouseClick(
    page: Page,
    handle: ElementHandle<Element>,
  ): Promise<boolean> {
    const box = await handle.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) {
      return false;
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y, { steps: 10 });
    await this.humanPause(40, 140);
    await page.mouse.down();
    await this.humanPause(40, 110);
    await page.mouse.up();
    return true;
  }

  private attachNetworkDebugLogging(page: Page): void {
    page.on("request", (req) => {
      if (req.method() !== "POST") {
        return;
      }
      const body = req.postData();
      this.logger.debug(
        `[net] POST ${req.url()} body=${body ? body.slice(0, 2000) : "<none>"}`,
      );
    });
    page.on("response", async (res) => {
      const req = res.request();
      if (req.method() !== "POST") {
        return;
      }
      const status = res.status();
      if (status < 400) {
        return;
      }
      let body = "";
      try {
        body = await res.text();
      } catch {
        body = "<unreadable>";
      }
      this.logger.error(
        `[net] POST ${res.url()} -> ${status} body=${body.slice(0, 2000)}`,
      );
    });
  }

  private async logFormState(page: Page, label: string): Promise<void> {
    try {
      const state = await page.evaluate(() => {
        const form = document.querySelector("form");
        if (!form) {
          return { found: false } as const;
        }
        const inputs = Array.from(form.querySelectorAll("input")).map((i) => ({
          name: i.name,
          type: i.type,
          value: i.value,
        }));
        const selects = Array.from(
          form.querySelectorAll("select"),
        ).map((s) => ({ name: s.name, value: s.value }));
        return { found: true, inputs, selects } as const;
      });
      this.logger.debug(`[form] ${label}: ${JSON.stringify(state)}`);
    } catch (e) {
      this.logger.warn(
        `[form] failed to read state (${label}): ${(e as Error).message}`,
      );
    }
  }
}
