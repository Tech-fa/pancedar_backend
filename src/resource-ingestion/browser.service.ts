import { Injectable, Logger } from "@nestjs/common";
import puppeteer, { Browser, Page } from "puppeteer";

const NAVIGATION_TIMEOUT_MS = 30_000;
const MAX_TEXT_LENGTH = 50_000;
const SITEMAP_FETCH_TIMEOUT_MS = 15_000;
const MAX_SITEMAP_NESTED = 12;
const MAX_PAGES_TO_SCAN = 150;

const PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

export type KeywordMatchOnPage = {
  pageUrl: string;
  matchedKeywords: string[];
  textSnippet: string;
};

/** Best-effort public contact hints scraped from the root URL and contact-style paths. */
export type PublicContactInfo = {
  phones: string[];
  emails: string[];
  linkedinUrl: string | null;
};

const EMAIL_IN_TEXT_RE = /\b[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}\b/g;
const LINKEDIN_IN_TEXT_RE = /https?:\/\/(?:www\.)?linkedin\.com\/[\w\-./%?=&]+/gi;
const MAX_CONTACT_PAGE_VISITS = 6;

@Injectable()
export class BrowserService {
  private readonly logger = new Logger(BrowserService.name);

  /**
   * Resolves crawlable page URLs from `/sitemap.xml` (and common variants), including
   * one-level `sitemapindex` expansion. If no sitemap yields URLs, returns `[websiteUrl]`.
   */
  async resolveUrlsToScanFromWebsiteRoot(
    websiteUrl: string,
  ): Promise<string[]> {
    const normalizedRoot = this.normalizeHttpUrl(websiteUrl);
    let root: URL;
    try {
      root = new URL(normalizedRoot);
    } catch {
      return [normalizedRoot];
    }

    const sitemapCandidates = [
      new URL("/sitemap.xml", root).href,
      new URL("/sitemap_index.xml", root).href,
      new URL("/sitemap-index.xml", root).href,
    ];

    const collected = new Set<string>();
    for (const sm of sitemapCandidates) {
      const locs = await this.fetchLocUrlsFromSitemap(sm, 0);
      for (const u of locs) {
        collected.add(u);
      }
      if (collected.size > 0) {
        break;
      }
    }

    if (collected.size === 0) {
      return [normalizedRoot];
    }
    return [...collected].slice(0, MAX_PAGES_TO_SCAN);
  }

  async launchBrowser(): Promise<Browser> {
    return await puppeteer.launch({
      headless: true,
      args: PUPPETEER_ARGS,
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {}),
    });
  }

  /**
   * Loads each page (Puppeteer), extracts visible text, and returns entries where
   * any keyword appears (case-insensitive substring).
   */
  async collectKeywordMatchesAcrossPages(
    browser: Browser,
    websiteUrl: string,
    rawKeywords: string[],
  ): Promise<KeywordMatchOnPage[]> {
    const keywords = rawKeywords
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    if (!keywords.length) {
      return [];
    }

    const pageUrls = await this.resolveUrlsToScanFromWebsiteRoot(websiteUrl);
    this.logger.log(
      `PROCESS_WEBSITE resolving ${pageUrls.length} pages from ${websiteUrl}`,
    );
    const out: KeywordMatchOnPage[] = [];

    try {
      let counter = 0;
      for (const pageUrl of pageUrls) {
        const text = await this.extractTextFromUrl(pageUrl, browser);
        if (!text) {
          continue;
        }
        const lower = text.toLowerCase();
        const matched = keywords.filter((kw) => lower.includes(kw));
        if (!matched.length) {
          continue;
        }
        const firstKw = matched[0];
        const idx = lower.indexOf(firstKw);
        const start = Math.max(0, idx - 100);
        const snippet = text.slice(start, start + 280).trim();
        out.push({
          pageUrl,
          matchedKeywords: matched,
          textSnippet: snippet,
        });
        counter++;
        if (counter > 20) {
          break;
        }
      }
    }finally {
      // await browser?.close().catch(() => undefined);
    }

    return out;
  }

  /**
   * Visits the site root plus URLs whose paths look like contact pages (from the sitemap
   * or `[websiteUrl]` fallback), then unions mailto/tel/LinkedIn links and plain-text matches.
   */
  async extractPublicContactInfoFromWebsiteRoot(
    browser: Browser,
    websiteUrl: string,
  ): Promise<PublicContactInfo> {
    const root = this.normalizeHttpUrl(websiteUrl);
    const pageUrls = await this.resolveUrlsToScanFromWebsiteRoot(websiteUrl);
    const contactPaths = pageUrls.filter((u) =>
      this.looksLikeContactPagePath(u),
    );
    const visitOrder = this.dedupeStrings([root, ...contactPaths]).slice(
      0,
      MAX_CONTACT_PAGE_VISITS,
    );

    const emails = new Set<string>();
    const phones = new Set<string>();
    const linkedins = new Set<string>();

    try {
      for (const pageUrl of visitOrder) {
        await this.harvestContactHintsFromPageUrl(
          pageUrl,
          browser,
          emails,
          phones,
          linkedins,
        );
      }
    } finally {
    }

    return {
      emails: [...emails],
      phones: [...phones],
      linkedinUrl: this.pickFirstLinkedin(linkedins),
    };
  }

  /**
   * When `browser` is omitted, launches and closes a browser for this URL.
   * When `browser` is provided, only the tab (page) is closed afterward.
   */
  async extractTextFromUrl(url: string, browser?: Browser): Promise<string> {
    const launchedHere = !browser;
    let activeBrowser: Browser | null = browser ?? null;
    let page: Page | null = null;
    try {
      if (!activeBrowser) {
        activeBrowser = await puppeteer.launch({
          headless: true,
          args: PUPPETEER_ARGS,
          ...(process.env.PUPPETEER_EXECUTABLE_PATH
            ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
            : {}),
        });
      }
      page = await activeBrowser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      );

      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: NAVIGATION_TIMEOUT_MS,
      });

      const text: string = await page.evaluate(() => {
        const clone = document.body.cloneNode(true) as HTMLElement;
        clone
          .querySelectorAll(
            "script, style, noscript, nav, footer, aside, header",
          )
          .forEach((el) => el.remove());
        return clone.innerText || clone.textContent || "";
      });

      const normalised = text.replace(/\s+/g, " ").trim();
      return normalised.length > MAX_TEXT_LENGTH
        ? normalised.slice(0, MAX_TEXT_LENGTH) + "…"
        : normalised;
    } catch (error) {
      this.logger.error(
        `Browser text extraction failed for URL: ${url}`,
        error?.stack,
      );
      return "";
    } finally {
      await page?.close().catch(() => undefined);
      if (launchedHere && activeBrowser) {
        await activeBrowser.close();
      }
    }
  }

  private normalizeHttpUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) {
      return trimmed;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }

  private parseLocTags(xml: string): string[] {
    const out: string[] = [];
    const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const u = m[1].trim();
      if (u) {
        out.push(u);
      }
    }
    return out;
  }

  private async fetchTextWithTimeout(url: string): Promise<string | null> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), SITEMAP_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; TechFA-Bot/1.0; +https://example.invalid)",
          Accept: "application/xml,text/xml,*/*",
        },
      });
      if (!res.ok) {
        return null;
      }
      return await res.text();
    } catch (e) {
      this.logger.debug(
        `Sitemap fetch failed for ${url}: ${(e as Error).message}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchLocUrlsFromSitemap(
    sitemapUrl: string,
    depth: number,
  ): Promise<string[]> {
    if (depth > 2) {
      return [];
    }
    const body = await this.fetchTextWithTimeout(sitemapUrl);
    if (!body) {
      return [];
    }
    const head = body.slice(0, 800).toLowerCase();
    if (head.includes("<sitemapindex")) {
      const nested = this.parseLocTags(body).slice(0, MAX_SITEMAP_NESTED);
      const merged: string[] = [];
      for (const n of nested) {
        merged.push(...(await this.fetchLocUrlsFromSitemap(n, depth + 1)));
      }
      return this.dedupeStrings(merged);
    }
    return this.parseLocTags(body);
  }

  private dedupeStrings(urls: string[]): string[] {
    return [...new Set(urls)];
  }

  private looksLikeContactPagePath(pageUrl: string): boolean {
    try {
      const path = new URL(pageUrl).pathname.toLowerCase();
      return (
        /(^|\/)(contact|contact-us|contact_us)(\/|$)/i.test(path) ||
        /(^|\/)get-in-touch(\/|$)/i.test(path) ||
        /(^|\/)reach-?us(\/|$)/i.test(path) ||
        /(^|\/)kontakt(\/|$)/i.test(path) ||
        /(^|\/)impressum(\/|$)/i.test(path) ||
        /\/about\/contact\//i.test(path)
      );
    } catch {
      return false;
    }
  }

  private async harvestContactHintsFromPageUrl(
    url: string,
    browser: Browser,
    emails: Set<string>,
    phones: Set<string>,
    linkedins: Set<string>,
  ): Promise<void> {
    let page: Page | null = null;
    try {
      page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      );
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      const raw = await page.evaluate(() => {
        const clone = document.body.cloneNode(true) as HTMLElement;
        clone
          .querySelectorAll("script, style, noscript")
          .forEach((el) => el.remove());
        const text = (clone.innerText || clone.textContent || "").replace(
          /\s+/g,
          " ",
        );
        const mailto: string[] = [];
        const tel: string[] = [];
        const li: string[] = [];
        document.querySelectorAll("a[href]").forEach((a) => {
          const h = (a.getAttribute("href") || "").trim();
          const low = h.toLowerCase();
          if (low.startsWith("mailto:")) {
            mailto.push(h.slice("mailto:".length));
          } else if (low.startsWith("tel:")) {
            tel.push(h.slice("tel:".length));
          } else if (/linkedin\.com\//i.test(h)) {
            li.push(h);
          }
        });
        return { text, mailto, tel, li };
      });

      const slice =
        raw.text.length > MAX_TEXT_LENGTH
          ? raw.text.slice(0, MAX_TEXT_LENGTH)
          : raw.text;

      for (const m of raw.mailto) {
        const addr = this.decodeMailtoAddress(m);
        if (addr && this.isPlausibleEmail(addr)) {
          emails.add(addr);
        }
      }
      for (const t of raw.tel) {
        const p = this.normalizePhoneCandidate(t);
        if (p && this.digitCount(p) >= 10) {
          phones.add(p);
        }
      }
      for (const l of raw.li) {
        const n = this.normalizeLinkedinUrl(l);
        if (n) {
          linkedins.add(n);
        }
      }
      this.addEmailsFromText(slice, emails);
      this.addPhonesFromText(slice, phones);
      this.addLinkedinsFromText(slice, linkedins);
    } catch (e) {
      this.logger.debug(
        `Contact harvest skipped for ${url}: ${(e as Error).message}`,
      );
    } finally {
      await page?.close().catch(() => undefined);
    }
  }

  private decodeMailtoAddress(mailtoBody: string): string | null {
    const head = mailtoBody.split(/[?&#]/)[0].trim();
    if (!head) {
      return null;
    }
    try {
      return decodeURIComponent(head);
    } catch {
      return head;
    }
  }

  private isPlausibleEmail(email: string): boolean {
    const e = email.trim().toLowerCase();
    if (!e.includes("@") || e.length > 320) {
      return false;
    }
    if (/\.(png|jpe?g|gif|webp|svg|ico|css|js)$/i.test(e)) {
      return false;
    }
    if (/@(example\.(com|org)|test\.com)$/.test(e)) {
      return false;
    }
    return true;
  }

  private addEmailsFromText(text: string, emails: Set<string>): void {
    let m: RegExpExecArray | null;
    const re = new RegExp(EMAIL_IN_TEXT_RE.source, "g");
    while ((m = re.exec(text)) !== null) {
      const addr = m[0];
      if (this.isPlausibleEmail(addr)) {
        emails.add(addr.trim());
      }
    }
  }

  private addPhonesFromText(text: string, phones: Set<string>): void {
    const re = /\+?\d[\d\s().[\]/-]{7,}\d/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const p = this.normalizePhoneCandidate(m[0]);
      if (p && this.digitCount(p) >= 10) {
        phones.add(p);
      }
    }
  }

  private addLinkedinsFromText(text: string, linkedins: Set<string>): void {
    let m: RegExpExecArray | null;
    const re = new RegExp(LINKEDIN_IN_TEXT_RE.source, "gi");
    while ((m = re.exec(text)) !== null) {
      const n = this.normalizeLinkedinUrl(m[0]);
      if (n) {
        linkedins.add(n);
      }
    }
  }

  private digitCount(s: string): number {
    return (s.match(/\d/g) || []).length;
  }

  private normalizePhoneCandidate(raw: string): string | null {
    const first = raw.split(/[;,|]/)[0].replace(/^tel:/i, "").trim();
    if (!first) {
      return null;
    }
    const compact = first.replace(/[^\d+]/g, "");
    if (compact.length < 8 || compact.length > 22) {
      return null;
    }
    return first.replace(/\s+/g, " ").trim().slice(0, 128);
  }

  private normalizeLinkedinUrl(raw: string): string | null {
    let href = raw.trim();
    if (!href) {
      return null;
    }
    if (href.startsWith("//")) {
      href = `https:${href}`;
    }
    if (!/^https?:\/\//i.test(href)) {
      try {
        href = new URL(href, "https://www.linkedin.com").href;
      } catch {
        return null;
      }
    }
    try {
      const u = new URL(href);
      const host = u.hostname.replace(/^www\./i, "").toLowerCase();
      if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) {
        return null;
      }
      const path = u.pathname.replace(/\/+$/, "") || "/";
      return `https://www.linkedin.com${path}${u.search}`;
    } catch {
      return null;
    }
  }

  private pickFirstEmail(emails: Set<string>): string | null {
    if (!emails.size) {
      return null;
    }
    const ranked = [...emails].sort((a, b) => {
      const penalty = (x: string) =>
        /^(info|hello|contact|sales|support)@/i.test(x) ? 1 : 0;
      return penalty(a) - penalty(b) || a.length - b.length;
    });
    return ranked[0] ?? null;
  }

  private pickFirstPhone(phones: Set<string>): string | null {
    if (!phones.size) {
      return null;
    }
    return [...phones].sort(
      (a, b) => this.digitCount(b) - this.digitCount(a),
    )[0];
  }

  private pickFirstLinkedin(linkedins: Set<string>): string | null {
    if (!linkedins.size) {
      return null;
    }
    const score = (u: string) => {
      const low = u.toLowerCase();
      if (/\/company\//.test(low)) {
        return 2;
      }
      if (/\/in\//.test(low)) {
        return 1;
      }
      return 0;
    };
    return [...linkedins].sort((a, b) => score(b) - score(a))[0];
  }
}
