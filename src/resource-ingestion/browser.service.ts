import { Injectable, Logger } from "@nestjs/common";
import puppeteer, { Browser } from "puppeteer";

const NAVIGATION_TIMEOUT_MS = 30_000;
const MAX_TEXT_LENGTH = 50_000;

const PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

@Injectable()
export class BrowserService {
  private readonly logger = new Logger(BrowserService.name);

  async extractTextFromUrl(url: string): Promise<string> {
    let browser: Browser | null = null;
    try {
       browser = await puppeteer.launch({
        headless: true,
        args: PUPPETEER_ARGS,
      });
      const page = await browser.newPage();
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
      await browser?.close();
    }
  }
}
