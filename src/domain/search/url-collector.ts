import type { JobBoard } from "../../shared/types/common.js";
import { detectBoard, isJobPostingUrl } from "../job/boards.js";
import type { SearchResult } from "./search-query.js";

export interface CollectedUrl {
  url: URL;
  board: JobBoard;
}

/**
 * Turns raw search results into a deduplicated list of parseable job URLs.
 *
 * - Invalid URLs are dropped.
 * - URLs on unsupported domains are dropped.
 * - Board index pages (company listings, not postings) are dropped.
 * - Duplicates are removed after stripping query strings and fragments,
 *   which Google frequently appends as tracking noise.
 */
export function collectJobUrls(results: readonly SearchResult[]): CollectedUrl[] {
  const seen = new Set<string>();
  const collected: CollectedUrl[] = [];

  for (const result of results) {
    let url: URL;
    try {
      url = new URL(result.url);
    } catch {
      continue;
    }
    url.search = "";
    url.hash = "";

    const board = detectBoard(url);
    if (!board || !isJobPostingUrl(url)) continue;

    const key = url.toString().replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    collected.push({ url, board });
  }

  return collected;
}
