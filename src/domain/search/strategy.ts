import type { SearchQuery } from "./search-query.js";

/**
 * What one issued query actually returned. The funnel narrows at every step,
 * and the ratios between these numbers are what `reflect` reasons about.
 */
export interface QueryOutcome {
  query: SearchQuery;
  /** Search results the query produced. */
  results: number;
  /** Results that deduplicated and parsed into jobs. */
  jobs: number;
  /** Jobs that cleared the keyword prefilter. */
  survivors: number;
}

/** A batch of queries plus the reasoning that produced them. */
export interface SearchPlan {
  queries: SearchQuery[];
  rationale: string;
  /** False when further searching is judged unproductive. */
  continue: boolean;
}

/**
 * Survivors per result — the signal that a query was worth issuing.
 * A query returning 50 results and no survivors scores 0, exactly like one
 * returning nothing, because both were equally wasted.
 */
export function queryYield(outcome: QueryOutcome): number {
  if (outcome.results <= 0) return 0;
  return outcome.survivors / outcome.results;
}

/** Aggregate yield across a run so far. */
export function aggregateYield(outcomes: readonly QueryOutcome[]): number {
  const results = outcomes.reduce((sum, o) => sum + o.results, 0);
  if (results <= 0) return 0;
  return outcomes.reduce((sum, o) => sum + o.survivors, 0) / results;
}

/**
 * True when the most recent queries have stopped producing survivors, which
 * is the signal to broaden vocabulary or stop rather than keep paying for
 * variations of an exhausted query.
 */
export function isYieldCollapsed(
  outcomes: readonly QueryOutcome[],
  { window = 3, threshold = 0 }: { window?: number; threshold?: number } = {},
): boolean {
  if (outcomes.length < window) return false;
  const recent = outcomes.slice(-window);
  return recent.every((outcome) => queryYield(outcome) <= threshold);
}
