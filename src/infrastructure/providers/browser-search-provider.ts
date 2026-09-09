import type { SearchQuery, SearchResult } from "../../domain/search/search-query.js";
import type { CacheProvider } from "../../shared/interfaces/cache-provider.js";
import type { Logger } from "../../shared/interfaces/logger.js";
import type { SearchProvider } from "../../shared/interfaces/search-provider.js";
import type { BrowserEngine } from "./browser-engine.js";
import { parseGoogleResultsPage } from "./google-search-provider.js";

export interface BrowserSearchOptions {
  engine: BrowserEngine;
  resultsPerQuery?: number;
  cacheTtlMs?: number;
  baseUrl?: string;
  /** Minimum pause between live Google requests (politeness, §16). */
  minDelayMs?: number;
}

const HEADED_HINT =
  "Run once with AUTOAPPLY_BROWSER_HEADED=1 to solve it in a visible Chrome window; the session is stored in the cache profile, so later headless runs reuse it.";

/**
 * Google Hacking provider backed by a real browser (RF-006). Because the
 * results page executes Google's own JavaScript, this works where the plain
 * HTTP scraper gets the JS-wall — no API key needed. Requests run one at a
 * time with a politeness delay, and results are cached (24h default, §16).
 */
export class BrowserSearchProvider implements SearchProvider {
  readonly name = "browser";

  private readonly engine: BrowserEngine;
  private readonly resultsPerQuery: number;
  private readonly cacheTtlMs: number;
  private readonly baseUrl: string;
  private readonly minDelayMs: number;
  /** Serializes live fetches — one browser, one Google request at a time. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly cache: CacheProvider,
    private readonly logger: Logger,
    options: BrowserSearchOptions,
  ) {
    this.engine = options.engine;
    this.resultsPerQuery = options.resultsPerQuery ?? 10;
    this.cacheTtlMs = options.cacheTtlMs ?? 24 * 60 * 60 * 1000;
    this.baseUrl = options.baseUrl || "https://www.google.com/search";
    this.minDelayMs = options.minDelayMs ?? 2_000;
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const cacheKey = `browser:${query.query}:${this.resultsPerQuery}`;
    const cached = await this.cache.get<SearchResult[]>(cacheKey);
    if (cached) {
      this.logger.debug("Browser search cache hit", { query: query.query });
      return cached;
    }

    const url = `${this.baseUrl}?q=${encodeURIComponent(query.query)}&num=${this.resultsPerQuery}&hl=en`;
    const page = await this.enqueue(() => this.engine.fetchPage(url));

    if (/consent\.google\./i.test(page.finalUrl)) {
      throw new Error(`Google is asking for cookie consent. ${HEADED_HINT}`);
    }
    if (/\/sorry\//.test(page.finalUrl) || /unusual traffic|g-recaptcha/i.test(page.html)) {
      throw new Error(`Google showed a CAPTCHA to the automated browser. ${HEADED_HINT}`);
    }

    const results = parseGoogleResultsPage(page.html).slice(0, this.resultsPerQuery);
    this.logger.debug("Browser search results", { query: query.query, count: results.length });
    await this.cache.set(cacheKey, results, this.cacheTtlMs);
    return results;
  }

  async close(): Promise<void> {
    await this.engine.close();
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const scheduled = this.queue.then(task);
    const pause = (): Promise<void> => sleep(this.minDelayMs + Math.random() * this.minDelayMs);
    // Failures must not wedge the queue; each live request is followed by a pause.
    this.queue = scheduled.then(pause, pause);
    return scheduled;
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
