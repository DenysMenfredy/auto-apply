import { DEFAULT_QUERY_OPTIONS, SearchQueryGenerator } from "@domain/search/query-generator.js";
import { describe, expect, it } from "vitest";
import { makeCandidate } from "../helpers/fakes.js";

describe("SearchQueryGenerator", () => {
  it("generates site: queries for every configured board (RF-005/RF-006)", () => {
    const generator = new SearchQueryGenerator({
      roles: ["Backend Engineer"],
      locations: ["Remote"],
      boards: ["ashby", "greenhouse", "lever", "workable", "bamboohr"],
      maxQueries: 10,
    });

    const queries = generator.generate(makeCandidate());
    expect(queries).toHaveLength(5);
    expect(queries.map((q) => q.query)).toEqual(
      expect.arrayContaining([
        'site:jobs.ashbyhq.com "Backend Engineer" "Remote"',
        'site:boards.greenhouse.io "Backend Engineer" "Remote"',
        'site:jobs.lever.co "Backend Engineer" "Remote"',
        'site:apply.workable.com "Backend Engineer" "Remote"',
        'site:bamboohr.com "Backend Engineer" "Remote"',
      ]),
    );
  });

  it("respects the maxQueries budget", () => {
    const generator = new SearchQueryGenerator({ ...DEFAULT_QUERY_OPTIONS, maxQueries: 7 });
    expect(generator.generate(makeCandidate())).toHaveLength(7);
  });

  it("prioritizes roles matching the candidate headline", () => {
    const generator = new SearchQueryGenerator({
      roles: ["Full Stack Engineer", "Backend Engineer"],
      locations: ["Remote"],
      boards: ["lever"],
      maxQueries: 2,
    });
    const queries = generator.generate(makeCandidate({ headline: "Senior Backend Engineer" }));
    expect(queries[0]?.role).toBe("Backend Engineer");
  });

  it("uses the candidate's preferred locations when present", () => {
    const generator = new SearchQueryGenerator({
      roles: ["Backend Engineer"],
      locations: ["United States"],
      boards: ["lever"],
      maxQueries: 1,
    });
    const queries = generator.generate(makeCandidate({ preferredLocations: ["LATAM"] }));
    expect(queries[0]?.query).toContain('"LATAM"');
  });
});
