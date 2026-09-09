import type { DiscoveryRunState } from "../../../domain/agent/run-state.js";
import type { CandidateProfile } from "../../../domain/candidate/candidate-profile.js";
import type { JobParser } from "../../../shared/interfaces/job-parser.js";
import type { Logger } from "../../../shared/interfaces/logger.js";
import type { MatchEngine } from "../../../shared/interfaces/match-engine.js";
import type { SearchProvider } from "../../../shared/interfaces/search-provider.js";

/**
 * Everything the tool layer needs, injected at the composition root
 * (AGENTS.md: never instantiate infrastructure inside a module).
 */
export interface ToolDeps {
  searchProvider: SearchProvider;
  parsers: JobParser[];
  matchEngine: MatchEngine;
  candidate: CandidateProfile;
  state: DiscoveryRunState;
  logger: Logger;
}

/**
 * Why a tool could not do its job. These are *expected, recoverable*
 * conditions — a blocked search engine, a page that will not parse — reported
 * as data so the agent can route around them. Genuine misuse (a malformed
 * argument) is a thrown `ToolInputParsingException` from the schema instead.
 */
export type ToolFailure = "blocked" | "unsupported" | "unparseable" | "not-fetched";

export function describeFailure(failure: ToolFailure, detail: string): string {
  switch (failure) {
    case "blocked":
      return `Search was blocked: ${detail}. Try a different board or provider.`;
    case "unsupported":
      return `No parser handles this URL: ${detail}. Skip it.`;
    case "unparseable":
      return `The page could not be parsed: ${detail}. Skip it.`;
    case "not-fetched":
      return `${detail} has not been fetched yet. Call fetch_job first.`;
  }
}
