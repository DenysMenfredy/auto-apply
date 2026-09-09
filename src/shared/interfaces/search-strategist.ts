import type { CandidateProfile } from "../../domain/candidate/candidate-profile.js";
import type { QueryOutcome, SearchPlan } from "../../domain/search/strategy.js";

export type { QueryOutcome, SearchPlan };

/**
 * Plans and refines Google Hacking queries (AGENT_PLAN §4).
 *
 * The application layer depends on this, never on a chat model: swapping
 * vendors, or replacing the agent with the deterministic generator, changes
 * only which implementation is wired in.
 */
export interface SearchStrategist {
  readonly name: string;
  /** First batch of queries for a candidate and target position. */
  plan(candidate: CandidateProfile, position: string): Promise<SearchPlan>;
  /** Next batch, given what the previous queries yielded. */
  refine(history: readonly QueryOutcome[]): Promise<SearchPlan>;
}
