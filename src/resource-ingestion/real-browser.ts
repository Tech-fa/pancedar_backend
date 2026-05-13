import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { connect } from "puppeteer-real-browser";
import type { Browser, ElementHandle, Page } from "rebrowser-puppeteer-core";

const NAVIGATION_TIMEOUT_MS = 30_000;
const CARLETON_PARKING_URL = "https://carletonparking.com";
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
      this.logger.log(`[real-browser] using persistent profile at ${configured}`);
      return configured;
    } catch (e) {
      this.logger.warn(
        `[real-browser] could not create user-data-dir ${configured}: ${(e as Error).message}; falling back to ephemeral profile`,
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
        `[real-browser] google.com prewarm failed (continuing): ${(e as Error).message}`,
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
    const input = rawInput as unknown as ElementHandle<HTMLInputElement>;
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
    const input = rawInput as unknown as ElementHandle<HTMLInputElement>;
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
        const selects = Array.from(form.querySelectorAll("select")).map(
          (s) => ({ name: s.name, value: s.value }),
        );
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
