import type { SearchQuery, SearchResult } from "../../domain/search/search-query.js";

/** A web search engine used for job discovery (Google, Bing, SerpAPI, ...). */
export interface SearchProvider {
  readonly name: string;
  search(query: SearchQuery): Promise<SearchResult[]>;
  /** Releases held resources (e.g. a launched browser). */
  close?(): Promise<void>;
}
