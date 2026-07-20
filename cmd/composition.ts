import path from "node:path";
import { BuildCandidateProfileUseCase } from "../src/application/build-candidate-profile.js";
import { ExportResultsUseCase } from "../src/application/export-results.js";
import { SearchJobsUseCase } from "../src/application/search-jobs.js";
import { KeywordMatchEngine } from "../src/domain/matching/keyword-match-engine.js";
import { SearchQueryGenerator } from "../src/domain/search/query-generator.js";
import { FilesystemCache } from "../src/infrastructure/cache/filesystem-cache.js";
import type { AppConfig } from "../src/infrastructure/config/config.js";
import { CsvExporter } from "../src/infrastructure/exporters/csv-exporter.js";
import { JsonExporter } from "../src/infrastructure/exporters/json-exporter.js";
import { MarkdownExporter } from "../src/infrastructure/exporters/markdown-exporter.js";
import { UndiciHttpClient } from "../src/infrastructure/http/undici-http-client.js";
import { createPinoLogger } from "../src/infrastructure/logging/pino-logger.js";
import { AshbyParser } from "../src/infrastructure/parser/ashby/ashby-parser.js";
import { BambooHrParser } from "../src/infrastructure/parser/bamboohr/bamboohr-parser.js";
import { GreenhouseParser } from "../src/infrastructure/parser/greenhouse/greenhouse-parser.js";
import { LeverParser } from "../src/infrastructure/parser/lever/lever-parser.js";
import { WorkableParser } from "../src/infrastructure/parser/workable/workable-parser.js";
import { DuckDuckGoSearchProvider } from "../src/infrastructure/providers/duckduckgo-search-provider.js";
import { GoogleCustomSearchProvider } from "../src/infrastructure/providers/google-custom-search-provider.js";
import { GoogleSearchProvider } from "../src/infrastructure/providers/google-search-provider.js";
import { LinkedInPublicProfileSource } from "../src/infrastructure/sources/linkedin-public-profile-source.js";
import { LinkedInSource } from "../src/infrastructure/sources/linkedin-source.js";
import { ResumePdfSource } from "../src/infrastructure/sources/resume-pdf-source.js";
import type { Logger } from "../src/shared/interfaces/logger.js";
import type { ProfileSource } from "../src/shared/interfaces/profile-source.js";

/**
 * Composition root (§ Dependency Injection): the only place where concrete
 * infrastructure is instantiated and wired to application use cases.
 */
export interface Container {
  logger: Logger;
  buildCandidateProfile: BuildCandidateProfileUseCase;
  searchJobs: SearchJobsUseCase;
  exportResults: ExportResultsUseCase;
}

export function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function buildContainer(config: AppConfig, options: { verbose?: boolean } = {}): Container {
  const logger = createPinoLogger({
    level: options.verbose ? "debug" : config.logLevel,
    pretty: true,
  });

  const http = new UndiciHttpClient();
  const cache = new FilesystemCache(path.resolve(config.cacheDir));

  const sources: ProfileSource[] = [];
  if (config.candidate.resumePath) sources.push(new ResumePdfSource(config.candidate.resumePath));
  if (config.candidate.linkedinPath) {
    // --linkedin accepts either a JSON export file or a public profile URL.
    sources.push(
      isUrl(config.candidate.linkedinPath)
        ? new LinkedInPublicProfileSource(config.candidate.linkedinPath, http)
        : new LinkedInSource(config.candidate.linkedinPath),
    );
  }

  const queryGenerator = new SearchQueryGenerator({
    roles: config.search.roles,
    locations: config.search.locations,
    boards: config.search.boards,
    maxQueries: config.search.maxQueries,
  });

  const providerOptions = {
    resultsPerQuery: config.search.resultsPerQuery,
    cacheTtlMs: config.search.cacheTtlMs,
  };
  const searchProvider = {
    google: () => new GoogleSearchProvider(http, cache, logger, providerOptions),
    "google-cse": () => new GoogleCustomSearchProvider(http, cache, logger, providerOptions),
    duckduckgo: () => new DuckDuckGoSearchProvider(http, cache, logger, providerOptions),
  }[config.search.provider]();

  const parsers = [
    new AshbyParser(http),
    new GreenhouseParser(http),
    new LeverParser(http),
    new WorkableParser(http),
    new BambooHrParser(http),
  ];

  const outputDir = path.resolve(config.output.dir);

  return {
    logger,
    buildCandidateProfile: new BuildCandidateProfileUseCase(sources, logger),
    searchJobs: new SearchJobsUseCase(
      queryGenerator,
      searchProvider,
      parsers,
      new KeywordMatchEngine(),
      logger,
    ),
    exportResults: new ExportResultsUseCase(
      [new JsonExporter(outputDir), new CsvExporter(outputDir), new MarkdownExporter(outputDir)],
      logger,
    ),
  };
}
