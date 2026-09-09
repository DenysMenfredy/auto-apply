import { DiscoveryRunState, dedupeKey } from "@domain/agent/run-state.js";
import {
  type QueryOutcome,
  aggregateYield,
  isYieldCollapsed,
  queryYield,
} from "@domain/search/strategy.js";
import { describe, expect, it } from "vitest";
import { makeJob } from "../helpers/fakes.js";

const URL_A = "https://jobs.lever.co/acme/1111aaaa-2222-bbbb-3333-cccc4444dddd";

function outcome(results: number, survivors: number): QueryOutcome {
  return {
    query: { query: "site:jobs.lever.co", role: "Backend Engineer", board: "lever" },
    results,
    jobs: survivors,
    survivors,
  };
}

describe("dedupeKey", () => {
  it("ignores tracking noise, fragments and trailing slashes", () => {
    expect(dedupeKey(`${URL_A}?utm_source=google#apply`)).toBe(dedupeKey(`${URL_A}/`));
  });

  it("falls back to the raw string for values that are not URLs", () => {
    expect(dedupeKey("  Not A URL ")).toBe("not a url");
  });
});

describe("DiscoveryRunState", () => {
  it("marks a URL seen once and reports duplicates thereafter", () => {
    const state = new DiscoveryRunState();
    expect(state.markSeen(URL_A)).toBe(true);
    expect(state.markSeen(`${URL_A}?utm_campaign=x`)).toBe(false);
    expect(state.hasSeen(URL_A)).toBe(true);
    expect(state.counts.seen).toBe(1);
  });

  it("stores parsed jobs so their text never has to pass through a model", () => {
    const state = new DiscoveryRunState();
    const job = makeJob();
    state.putJob(URL_A, job);
    expect(state.getJob(`${URL_A}#section`)).toBe(job);
    expect(state.getJob("https://example.com/other")).toBeUndefined();
  });

  it("returns findings ranked by score and updates rather than duplicates", () => {
    const state = new DiscoveryRunState();
    state.addFinding({ url: URL_A, title: "A", company: "Acme", score: 70 });
    state.addFinding({ url: "https://jobs.lever.co/b/2", title: "B", company: "B", score: 95 });
    state.addFinding({ url: `${URL_A}?ref=x`, title: "A", company: "Acme", score: 88 });

    expect(state.findings.map((f) => f.score)).toEqual([95, 88]);
    expect(state.counts.findings).toBe(2);
  });

  it("accumulates query history", () => {
    const state = new DiscoveryRunState();
    state.recordOutcome(outcome(10, 2));
    expect(state.history).toHaveLength(1);
    expect(state.counts.queries).toBe(1);
  });
});

describe("yield maths", () => {
  it("scores a wasted query zero whether it returned nothing or nothing useful", () => {
    expect(queryYield(outcome(0, 0))).toBe(0);
    expect(queryYield(outcome(50, 0))).toBe(0);
    expect(queryYield(outcome(10, 3))).toBeCloseTo(0.3, 6);
  });

  it("aggregates across a run", () => {
    expect(aggregateYield([outcome(10, 2), outcome(10, 4)])).toBeCloseTo(0.3, 6);
    expect(aggregateYield([])).toBe(0);
  });

  it("detects collapse only after a full window of barren queries", () => {
    expect(isYieldCollapsed([outcome(10, 0), outcome(10, 0)])).toBe(false);
    expect(isYieldCollapsed([outcome(10, 0), outcome(10, 0), outcome(10, 0)])).toBe(true);
    // One productive query in the window means the seam is not exhausted.
    expect(isYieldCollapsed([outcome(10, 0), outcome(10, 1), outcome(10, 0)])).toBe(false);
  });
});
