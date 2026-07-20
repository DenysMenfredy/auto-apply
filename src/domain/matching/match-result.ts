import type { CandidateProfile } from "../candidate/candidate-profile.js";
import type { Job } from "../job/job.js";

export type MatchCategory = "excellent" | "very-good" | "good" | "discard";

export interface MatchResult {
  job: Job;
  candidate: CandidateProfile;
  /** Compatibility score, 0-100. */
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  weaknesses: string[];
}

/** RF-010 score bands: Excellent 90-100, Very Good 80-89, Good 70-79, Discard <70. */
export function categorize(score: number): MatchCategory {
  if (score >= 90) return "excellent";
  if (score >= 80) return "very-good";
  if (score >= 70) return "good";
  return "discard";
}
