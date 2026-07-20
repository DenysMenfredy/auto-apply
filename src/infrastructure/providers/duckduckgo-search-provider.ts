import * as cheerio from "cheerio";
import type { SearchQuery, SearchResult } from "../../domain/search/search-query.js";
import type { CacheProvider } from "../../shared/interfaces/cache-provider.js";
import type { HttpClient } from "../../shared/interfaces/http-client.js";
import type { Logger } from "../../shared/interfaces/logger.js";
import type { SearchProvider } from "../../shared/interfaces/search-provider.js";

export interface DuckDuckGoSearchOptions {
  resultsPerQuery?: number;
  cacheTtlMs?: number;
  baseUrl?: string;
}

/**
 * DuckDuckGo HTML provider (html.duckduckgo.com/html) — a keyless alternative
 * that renders results without JavaScript and supports site: operators.
 *
 * DuckDuckGo also bot-challenges some clients (HTTP 202 "anomaly" page);
 * that case fails with an actionable error rather than empty results.
 */
export class DuckDuckGoSearchProvider implements SearchProvider {
  readonly name = "duckduckgo";

  private readonly resultsPerQuery: number;
  private readonly cacheTtlMs: number;
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    private readonly cache: CacheProvider,
    private readonly logger: Logger,
    options: DuckDuckGoSearchOptions = {},
  ) {
    this.resultsPerQuery = options.resultsPerQuery ?? 10;
    this.cacheTtlMs = options.cacheTtlMs ?? 24 * 60 * 60 * 1000;
    this.baseUrl = options.baseUrl ?? "https://html.duckduckgo.com/html/";
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const cacheKey = `ddg:${query.query}:${this.resultsPerQuery}`;
    const cached = await this.cache.get<SearchResult[]>(cacheKey);
    if (cached) {
      this.logger.debug("DuckDuckGo cache hit", { query: query.query });
      return cached;
    }

    const url = `${this.baseUrl}?q=${encodeURIComponent(query.query)}`;
    const response = await this.http.get(url);

    if (response.status === 202 || /anomaly-modal|challenge-form/i.test(response.body)) {
      throw new Error(
        "DuckDuckGo is bot-challenging this client. Wait a while, or use the official " +
          "Google API instead: --provider google-cse (see README for setup).",
      );
    }
    if (response.status >= 400) {
      throw new Error(`DuckDuckGo search failed with HTTP ${response.status} for: ${query.query}`);
    }

    const results = parseDuckDuckGoResultsPage(response.body).slice(0, this.resultsPerQuery);
    await this.cache.set(cacheKey, results, this.cacheTtlMs);
    return results;
  }
}

/**
 * Result links are `a.result__a` anchors whose href is a redirect:
 * //duckduckgo.com/l/?uddg=<url-encoded target>&rut=... — with occasional
 * direct links.
 */
export function parseDuckDuckGoResultsPage(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const results: SearchResult[] = [];

  $("a.result__a").each((_, anchor) => {
    const element = $(anchor);
    const target = resolveTarget(element.attr("href") ?? "");
    if (!target || seen.has(target)) return;

    const title = element.text().trim();
    if (!title) return;

    const snippet = element
      .closest(".result__body, .result")
      .find(".result__snippet")
      .first()
      .text()
      .trim();

    seen.add(target);
    results.push({ title, url: target, ...(snippet ? { snippet } : {}) });
  });

  return results;
}

function resolveTarget(href: string): string | null {
  if (href.startsWith("http") && !/duckduckgo\.com\//i.test(href)) return href;
  const match = href.match(/[?&]uddg=([^&]+)/);
  if (!match?.[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    return decoded.startsWith("http") ? decoded : null;
  } catch {
    return null;
  }
}
