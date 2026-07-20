import type { SearchQuery, SearchResult } from "../../domain/search/search-query.js";
import type { CacheProvider } from "../../shared/interfaces/cache-provider.js";
import type { HttpClient } from "../../shared/interfaces/http-client.js";
import type { Logger } from "../../shared/interfaces/logger.js";
import type { SearchProvider } from "../../shared/interfaces/search-provider.js";

export interface GoogleCustomSearchOptions {
  apiKey?: string;
  engineId?: string;
  resultsPerQuery?: number;
  cacheTtlMs?: number;
  baseUrl?: string;
}

const SETUP_HINT =
  "Create a Programmable Search Engine at https://programmablesearchengine.google.com " +
  '(enable "Search the entire web"), then set GOOGLE_CSE_ID to its engine id and ' +
  "GOOGLE_CSE_API_KEY to a Google Cloud API key with the Custom Search API enabled.";

/**
 * Official Google Custom Search JSON API provider — the reliable alternative
 * to scraping Google's HTML, which Google now blocks. Free tier: 100
 * queries/day. Requires GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID.
 */
export class GoogleCustomSearchProvider implements SearchProvider {
  readonly name = "google-cse";

  private readonly apiKey: string | undefined;
  private readonly engineId: string | undefined;
  private readonly resultsPerQuery: number;
  private readonly cacheTtlMs: number;
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    private readonly cache: CacheProvider,
    private readonly logger: Logger,
    options: GoogleCustomSearchOptions = {},
  ) {
    // `||` not `??`: empty strings from .env templates count as unset.
    this.apiKey = options.apiKey || process.env.GOOGLE_CSE_API_KEY || undefined;
    this.engineId = options.engineId || process.env.GOOGLE_CSE_ID || undefined;
    // The API caps results at 10 per request.
    this.resultsPerQuery = Math.min(options.resultsPerQuery ?? 10, 10);
    this.cacheTtlMs = options.cacheTtlMs ?? 24 * 60 * 60 * 1000;
    this.baseUrl = options.baseUrl ?? "https://www.googleapis.com/customsearch/v1";
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    if (!this.apiKey || !this.engineId) {
      throw new Error(`Google Custom Search is not configured. ${SETUP_HINT}`);
    }

    const cacheKey = `google-cse:${query.query}:${this.resultsPerQuery}`;
    const cached = await this.cache.get<SearchResult[]>(cacheKey);
    if (cached) {
      this.logger.debug("Google CSE cache hit", { query: query.query });
      return cached;
    }

    const url =
      `${this.baseUrl}?key=${encodeURIComponent(this.apiKey)}` +
      `&cx=${encodeURIComponent(this.engineId)}` +
      `&q=${encodeURIComponent(query.query)}&num=${this.resultsPerQuery}`;
    const response = await this.http.get(url, { accept: "application/json" });

    if (response.status === 429) {
      throw new Error(
        "Google Custom Search daily quota exhausted (free tier: 100 queries/day). " +
          "Lower search.maxQueries or retry tomorrow.",
      );
    }
    if (response.status >= 400) {
      throw new Error(
        `Google Custom Search failed with HTTP ${response.status}: ${apiErrorMessage(response.body)}`,
      );
    }

    const results = parseCustomSearchResponse(response.body);
    await this.cache.set(cacheKey, results, this.cacheTtlMs);
    return results;
  }
}

export function parseCustomSearchResponse(body: string): SearchResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("Google Custom Search returned a non-JSON response.");
  }
  const items = (parsed as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  const results: SearchResult[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const { title, link, snippet } = item as { title?: unknown; link?: unknown; snippet?: unknown };
    if (typeof link !== "string" || !link.startsWith("http")) continue;
    results.push({
      title: typeof title === "string" ? title : link,
      url: link,
      ...(typeof snippet === "string" ? { snippet } : {}),
    });
  }
  return results;
}

function apiErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message ?? "unknown error";
  } catch {
    return "unknown error";
  }
}
