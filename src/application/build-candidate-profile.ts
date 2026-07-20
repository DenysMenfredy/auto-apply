import { CandidateProfileBuilder } from "../domain/candidate/candidate-builder.js";
import type { CandidateProfile } from "../domain/candidate/candidate-profile.js";
import type { Logger } from "../shared/interfaces/logger.js";
import type { ProfileSource } from "../shared/interfaces/profile-source.js";

/**
 * Builds one normalized CandidateProfile from every available ProfileSource
 * (RF-001/RF-004). Source order defines priority for scalar fields.
 *
 * A single failing source is logged and skipped; failing to parse *every*
 * source is fatal because no profile can exist without data.
 */
export class BuildCandidateProfileUseCase {
  constructor(
    private readonly sources: ProfileSource[],
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<CandidateProfile> {
    if (this.sources.length === 0) {
      throw new Error(
        "No profile sources configured. Provide a resume PDF (--resume) or LinkedIn export (--linkedin).",
      );
    }

    const builder = new CandidateProfileBuilder();
    let parsedCount = 0;

    for (const source of this.sources) {
      this.logger.info("Parsing profile source", { source: source.name });
      try {
        builder.add(await source.parse());
        parsedCount += 1;
      } catch (error) {
        this.logger.warn("Profile source failed, skipping", {
          source: source.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (parsedCount === 0) {
      throw new Error("Every profile source failed to parse. Check the input files.");
    }

    this.logger.info("Building candidate profile", { sources: parsedCount });
    return builder.build();
  }
}
