import type { CandidateProfile } from "../../domain/candidate/candidate-profile.js";
import type { Job } from "../../domain/job/job.js";
import type { MatchResult } from "../../domain/matching/match-result.js";

/** Evaluates candidate/job compatibility (keyword today, semantic/LLM later). */
export interface MatchEngine {
  evaluate(candidate: CandidateProfile, job: Job): Promise<MatchResult>;
}
