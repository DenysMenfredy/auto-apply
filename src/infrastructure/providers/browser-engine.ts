import type { BrowserContext } from "playwright-core";

export interface FetchedPage {
  html: string;
  finalUrl: string;
}

/**
 * Minimal browser abstraction: everything the browser search provider needs
 * from Playwright, so the provider itself stays unit-testable offline.
 */
export interface BrowserEngine {
  fetchPage(url: string): Promise<FetchedPage>;
  close(): Promise<void>;
}

export interface PlaywrightEngineOptions {
  /** Persistent profile directory — keeps cookies/consent between runs. */
  profileDir: string;
  headless?: boolean;
  /** Explicit browser binary; when unset, the installed Google Chrome is used. */
  executablePath?: string;
  navigationTimeoutMs?: number;
  /** How long to wait for organic results — long in headed mode so a human can solve a CAPTCHA mid-run. */
  resultsWaitMs?: number;
}

/**
 * Drives the locally installed Chrome via playwright-core (no bundled browser
 * download). Uses a persistent profile so a CAPTCHA or consent screen solved
 * once in a headed run keeps working in later headless runs.
 *
 * The browser only ever renders search-engine result pages; job pages are
 * still fetched and parsed statically (§20).
 */
export class PlaywrightBrowserEngine implements BrowserEngine {
  private context: BrowserContext | null = null;

  constructor(private readonly options: PlaywrightEngineOptions) {}

  private async ensureContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    const { chromium } = await import("playwright-core");
    try {
      this.context = await chromium.launchPersistentContext(this.options.profileDir, {
        headless: this.options.headless ?? true,
        ...(this.options.executablePath
          ? { executablePath: this.options.executablePath }
          : { channel: "chrome" }),
        viewport: { width: 1280, height: 800 },
      });
    } catch (error) {
      throw new Error(
        `Could not launch Chrome for the browser provider: ${(error as Error).message}. Install Google Chrome, or point AUTOAPPLY_BROWSER_EXECUTABLE at a Chromium binary.`,
      );
    }
    return this.context;
  }

  async fetchPage(url: string): Promise<FetchedPage> {
    const context = await this.ensureContext();
    const page = await context.newPage();
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: this.options.navigationTimeoutMs ?? 30_000,
      });
      // Results render client-side; wait briefly for organic links, but keep
      // whatever the page shows (CAPTCHA, consent) so the caller can react.
      await page
        .waitForSelector("#search a h3", { timeout: this.options.resultsWaitMs ?? 8_000 })
        .catch(() => {});
      return { html: await page.content(), finalUrl: page.url() };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => {});
    this.context = null;
  }
}
