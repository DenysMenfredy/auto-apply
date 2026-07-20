import type { MatchResult } from "./match-result.js";

export interface RankingOptions {
  /** Results scoring below this are dropped. Defaults to 0 (keep everything). */
  minScore?: number;
  /** Maximum number of results to keep after sorting. */
  limit?: number;
}

/** Sort match results by descending score (RF-010), applying optional filters. */
export function rankResults(
  results: readonly MatchResult[],
  options: RankingOptions = {},
): MatchResult[] {
  const { minScore = 0, limit } = options;
  const ranked = results
    .filter((result) => result.score >= minScore)
    .sort((a, b) => b.score - a.score);
  return limit !== undefined ? ranked.slice(0, limit) : ranked;
}
