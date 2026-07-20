import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BuildCandidateProfileUseCase } from "@application/build-candidate-profile.js";
import { SearchJobsUseCase } from "@application/search-jobs.js";
import { KeywordMatchEngine } from "@domain/matching/keyword-match-engine.js";
import { SearchQueryGenerator } from "@domain/search/query-generator.js";
import { AshbyParser } from "@infrastructure/parser/ashby/ashby-parser.js";
import { GreenhouseParser } from "@infrastructure/parser/greenhouse/greenhouse-parser.js";
import { LeverParser } from "@infrastructure/parser/lever/lever-parser.js";
import { GoogleSearchProvider } from "@infrastructure/providers/google-search-provider.js";
import { LinkedInSource } from "@infrastructure/sources/linkedin-source.js";
import { describe, expect, it } from "vitest";
import { FakeHttpClient, MemoryCache, nullLogger } from "../helpers/fakes.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

describe("search pipeline (acceptance criteria)", () => {
  it("builds a profile, discovers, parses, ranks and returns jobs", async () => {
    const [google, lever, greenhouse, ashby] = await Promise.all(
      ["google-results.html", "lever.html", "greenhouse.html", "ashby.html"].map((name) =>
        readFile(path.join(fixturesDir, name), "utf-8"),
      ),
    );

    const http = new FakeHttpClient({
      "https://www.google.com/search": google as string,
      "https://jobs.lever.co": lever as string,
      "https://boards.greenhouse.io": greenhouse as string,
      "https://jobs.ashbyhq.com": ashby as string,
    });

    const buildProfile = new BuildCandidateProfileUseCase(
      [new LinkedInSource(path.join(fixturesDir, "linkedin-export.json"))],
      nullLogger,
    );
    const candidate = await buildProfile.execute();
    expect(candidate.name).toBe("Jane Doe");
    expect(candidate.seniority).toBe("senior");

    const searchJobs = new SearchJobsUseCase(
      new SearchQueryGenerator({
        roles: ["Backend Engineer"],
        locations: ["Remote"],
        boards: ["lever", "greenhouse", "ashby"],
        maxQueries: 3,
      }),
      new GoogleSearchProvider(http, new MemoryCache(), nullLogger),
      [new LeverParser(http), new GreenhouseParser(http), new AshbyParser(http)],
      new KeywordMatchEngine(),
      nullLogger,
    );

    const results = await searchJobs.execute(candidate, { concurrency: 2 });

    // 3 unique parseable URLs in the Google fixture (dup + index + unsupported dropped)
    expect(results).toHaveLength(3);
    // sorted descending
    const scores = results.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    // the backend job matching the candidate stack ranks first
    expect(results[0]?.job.title).toBe("Senior Backend Engineer");
    expect(results[0]?.score).toBeGreaterThanOrEqual(80);
  });

  it("recovers from failing queries and unparseable pages", async () => {
    const google = await readFile(path.join(fixturesDir, "google-results.html"), "utf-8");
    // Job pages all 404: pipeline should log-and-skip, returning no results.
    const http = new FakeHttpClient({ "https://www.google.com/search": google });

    const searchJobs = new SearchJobsUseCase(
      new SearchQueryGenerator({
        roles: ["Backend Engineer"],
        locations: ["Remote"],
        boards: ["lever"],
        maxQueries: 1,
      }),
      new GoogleSearchProvider(http, new MemoryCache(), nullLogger),
      [new LeverParser(http)],
      new KeywordMatchEngine(),
      nullLogger,
    );

    const candidate = await new BuildCandidateProfileUseCase(
      [new LinkedInSource(path.join(fixturesDir, "linkedin-export.json"))],
      nullLogger,
    ).execute();

    await expect(searchJobs.execute(candidate)).resolves.toEqual([]);
  });
});
