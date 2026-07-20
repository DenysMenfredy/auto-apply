import type { JobBoard } from "../../shared/types/common.js";

export interface SearchQuery {
  /** Full query string with Google Hacking operators, e.g. `site:jobs.lever.co "AI Engineer"`. */
  query: string;
  role: string;
  board: JobBoard;
  location?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
}
