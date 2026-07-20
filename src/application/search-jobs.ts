import type { CandidateProfile } from "../domain/candidate/candidate-profile.js";
import type { Job } from "../domain/job/job.js";
import type { MatchResult } from "../domain/matching/match-result.js";
import { type RankingOptions, rankResults } from "../domain/matching/ranking.js";
import type { SearchQueryGenerator } from "../domain/search/query-generator.js";
import type { SearchResult } from "../domain/search/search-query.js";
import { type CollectedUrl, collectJobUrls } from "../domain/search/url-collector.js";
import type { JobParser } from "../shared/interfaces/job-parser.js";
import type { Logger } from "../shared/interfaces/logger.js";
import type { MatchEngine } from "../shared/interfaces/match-engine.js";
import type { SearchProvider } from "../shared/interfaces/search-provider.js";
import { mapWithConcurrency } from "../shared/utils/concurrency.js";

export interface SearchJobsOptions extends RankingOptions {
  /** Parallel job page fetches. Bounded to stay polite and predictable. */
  concurrency?: number;
}

/**
 * End-to-end discovery pipeline (Search Flow, SDD §11):
 * queries → search provider → URL collection → board-routed parsing →
 * matching → ranking.
 *
 * Individual query or parse failures are logged and skipped (§21: recover
 * when possible); the pipeline only fails when nothing could be discovered.
 */
export class SearchJobsUseCase {
  constructor(
    private readonly queryGenerator: SearchQueryGenerator,
    private readonly searchProvider: SearchProvider,
    private readonly parsers: JobParser[],
    private readonly matchEngine: MatchEngine,
    private readonly logger: Logger,
  ) {}

  async execute(
    candidate: CandidateProfile,
    options: SearchJobsOptions = {},
  ): Promise<MatchResult[]> {
    const queries = this.queryGenerator.generate(candidate);
    this.logger.info("Searching jobs", {
      queries: queries.length,
      provider: this.searchProvider.name,
    });

    const searchResults: SearchResult[] = [];
    for (const query of queries) {
      try {
        searchResults.push(...(await this.searchProvider.search(query)));
      } catch (error) {
        this.logger.warn("Search query failed, skipping", {
          query: query.query,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const urls = collectJobUrls(searchResults);
    this.logger.info("Collected job URLs", { raw: searchResults.length, unique: urls.length });

    const jobs = await this.parseJobs(urls, options.concurrency ?? 5);
    this.logger.info("Parsed jobs", { parsed: jobs.length, failed: urls.length - jobs.length });

    this.logger.info("Ranking opportunities", { jobs: jobs.length });
    const results = await Promise.all(jobs.map((job) => this.matchEngine.evaluate(candidate, job)));
    return rankResults(results, options);
  }

  private async parseJobs(urls: readonly CollectedUrl[], concurrency: number): Promise<Job[]> {
    const parsed = await mapWithConcurrency(urls, concurrency, async ({ url, board }) => {
      const parser = this.parsers.find((p) => p.board === board && p.supports(url));
      if (!parser) {
        this.logger.warn("No parser for URL, skipping", { url: url.toString(), board });
        return null;
      }
      try {
        return await parser.parse(url);
      } catch (error) {
        this.logger.warn("Job parse failed, skipping", {
          url: url.toString(),
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    });
    return parsed.filter((job): job is Job => job !== null);
  }
}
