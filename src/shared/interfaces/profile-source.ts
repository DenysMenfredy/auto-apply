import type { CandidateProfile } from "../../domain/candidate/candidate-profile.js";

/** A source of candidate information (resume PDF, LinkedIn export, GitHub, ...). */
export interface ProfileSource {
  /** Human-readable source name used in logs and errors. */
  readonly name: string;
  parse(): Promise<Partial<CandidateProfile>>;
}
