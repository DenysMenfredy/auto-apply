import * as cheerio from "cheerio";
import type { SearchQuery, SearchResult } from "../../domain/search/search-query.js";
import type { CacheProvider } from "../../shared/interfaces/cache-provider.js";
import type { HttpClient } from "../../shared/interfaces/http-client.js";
import type { Logger } from "../../shared/interfaces/logger.js";
import type { SearchProvider } from "../../shared/interfaces/search-provider.js";

export interface GoogleSearchOptions {
  resultsPerQuery?: number;
  cacheTtlMs?: number;
  baseUrl?: string;
}

/**
 * Google Hacking search provider (RF-006). Scrapes the classic HTML results
 * page; results are cached (24h default, §16) to avoid duplicate requests.
 *
 * Never executes page JavaScript — the HTML is parsed statically (§20).
 */
export class GoogleSearchProvider implements SearchProvider {
  readonly name = "google";

  private readonly resultsPerQuery: number;
  private readonly cacheTtlMs: number;
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    private readonly cache: CacheProvider,
    private readonly logger: Logger,
    options: GoogleSearchOptions = {},
  ) {
    this.resultsPerQuery = options.resultsPerQuery ?? 10;
    this.cacheTtlMs = options.cacheTtlMs ?? 24 * 60 * 60 * 1000;
    // `||` not `??`: .env templates leave GOOGLE_SEARCH_BASE_URL= empty, and
    // an empty base must fall back to the default, not produce "?q=..." URLs.
    this.baseUrl =
      options.baseUrl || process.env.GOOGLE_SEARCH_BASE_URL || "https://www.google.com/search";
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const cacheKey = `google:${query.query}:${this.resultsPerQuery}`;
    const cached = await this.cache.get<SearchResult[]>(cacheKey);
    if (cached) {
      this.logger.debug("Google cache hit", { query: query.query });
      return cached;
    }

    const url = `${this.baseUrl}?q=${encodeURIComponent(query.query)}&num=${this.resultsPerQuery}&hl=en`;
    const response = await this.http.get(url);

    if (response.status === 429 || /unusual traffic|captcha/i.test(response.body)) {
      throw new Error(
        "Google is rate-limiting requests. Use the official Google API instead: " +
          "--provider google-cse (needs GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID, see README), " +
          "or try --provider duckduckgo.",
      );
    }
    if (response.status >= 400) {
      throw new Error(`Google search failed with HTTP ${response.status} for: ${query.query}`);
    }

    const results = parseGoogleResultsPage(response.body).slice(0, this.resultsPerQuery);

    // Google serves a JavaScript-required interstitial to non-JS clients.
    // Zero results plus that marker means the account/IP cannot use the HTML
    // endpoint — surface it instead of silently returning nothing (§21).
    if (results.length === 0 && /enablejs|enable javascript/i.test(response.body)) {
      throw new Error(
        "Google returned its JavaScript-required page instead of results. " +
          "Use the official Google API instead: --provider google-cse " +
          "(needs GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID, see README), " +
          "or try --provider duckduckgo.",
      );
    }

    await this.cache.set(cacheKey, results, this.cacheTtlMs);
    return results;
  }
}

/**
 * Extracts organic results from a Google results page. Handles both direct
 * links (desktop layout: h3 inside an anchor) and redirect-style
 * `/url?q=<target>` links (basic/legacy layout).
 */
export function parseGoogleResultsPage(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const results: SearchResult[] = [];

  $("a[href]").each((_, anchor) => {
    const element = $(anchor);
    const href = element.attr("href") ?? "";
    const target = resolveTarget(href);
    if (!target || seen.has(target)) return;

    const title = element.find("h3").first().text().trim() || element.text().trim();
    if (!title) return;

    seen.add(target);
    results.push({ title, url: target });
  });

  return results;
}

function resolveTarget(href: string): string | null {
  if (href.startsWith("/url?")) {
    const params = new URLSearchParams(href.slice("/url?".length));
    const q = params.get("q") ?? params.get("url");
    return q?.startsWith("http") ? q : null;
  }
  if (href.startsWith("http") && !/google\.[a-z.]+\//i.test(href)) return href;
  return null;
}
