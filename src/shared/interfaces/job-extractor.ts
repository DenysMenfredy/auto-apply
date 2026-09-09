import type { Job } from "../../domain/job/job.js";

/** Raw page content handed to an extractor. */
export interface PageContent {
  url: string;
  html: string;
}

/**
 * Structured extraction fallback (AGENT_PLAN §2, tier 3).
 *
 * Only reached when JSON-LD and CSS selectors both fail, so implementations
 * are expected to be rare and expensive relative to the deterministic tiers.
 */
export interface JobExtractor {
  readonly name: string;
  extract(page: PageContent): Promise<Partial<Job>>;
}
