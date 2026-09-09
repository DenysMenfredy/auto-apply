import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DiscoveryRunState } from "@domain/agent/run-state.js";
import { KeywordMatchEngine } from "@domain/matching/keyword-match-engine.js";
import type { SearchQuery, SearchResult } from "@domain/search/search-query.js";
import { createCheckSeenTool } from "@infrastructure/agent/tools/check-seen.js";
import { createFetchJobTool } from "@infrastructure/agent/tools/fetch-job.js";
import { createAgentTools } from "@infrastructure/agent/tools/index.js";
import { createPrefilterScoreTool } from "@infrastructure/agent/tools/prefilter-score.js";
import { createRecordFindingTool } from "@infrastructure/agent/tools/record-finding.js";
import { createSearchWebTool } from "@infrastructure/agent/tools/search-web.js";
import type { ToolDeps } from "@infrastructure/agent/tools/types.js";
import { LeverParser } from "@infrastructure/parser/lever/lever-parser.js";
import type { SearchProvider } from "@shared/interfaces/search-provider.js";
import { beforeAll, describe, expect, it } from "vitest";
import { FakeHttpClient, makeCandidate, makeJob, nullLogger } from "../helpers/fakes.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const LEVER_URL = "https://jobs.lever.co/acme/1111aaaa-2222-bbbb-3333-cccc4444dddd";

class StubSearchProvider implements SearchProvider {
  readonly name = "stub";
  readonly queries: SearchQuery[] = [];
  constructor(private readonly behaviour: SearchResult[] | Error) {}
  search(query: SearchQuery): Promise<SearchResult[]> {
    this.queries.push(query);
    if (this.behaviour instanceof Error) return Promise.reject(this.behaviour);
    return Promise.resolve(this.behaviour);
  }
}

let leverHtml: string;
beforeAll(async () => {
  leverHtml = await readFile(path.join(fixturesDir, "lever.html"), "utf-8");
});

function makeDeps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    searchProvider: new StubSearchProvider([]),
    parsers: [new LeverParser(new FakeHttpClient({ "https://jobs.lever.co": leverHtml }))],
    matchEngine: new KeywordMatchEngine(),
    candidate: makeCandidate(),
    state: new DiscoveryRunState(),
    logger: nullLogger,
    ...overrides,
  };
}

/**
 * Tool generics are deliberately strict, so tests reach them through two
 * narrow casts kept here rather than scattered through the assertions.
 */
type LooseTool = { invoke: (input: unknown) => Promise<unknown> };

/** Invokes a tool the way an agent does: a tool call in, a ToolMessage out. */
async function invoke(tool: unknown, args: Record<string, unknown>) {
  return (await (tool as LooseTool).invoke({
    name: "call",
    args,
    id: "call-1",
    type: "tool_call",
  })) as { content: string; artifact: unknown };
}

/** Invokes with raw arguments, for asserting runtime schema rejection. */
function invokeRaw(tool: unknown, args: Record<string, unknown>): Promise<unknown> {
  return (tool as LooseTool).invoke(args);
}

describe("agent tool surface (AGENT_PLAN M1)", () => {
  it("exposes exactly the five planned tools and nothing that submits", () => {
    const tools = createAgentTools(makeDeps());
    expect(tools.map((t) => t.name).sort()).toEqual([
      "check_seen",
      "fetch_job",
      "prefilter_score",
      "record_finding",
      "search_web",
    ]);
    // The discovery-only constraint is structural: no apply/submit/send tool exists.
    expect(tools.some((t) => /apply|submit|send|email/i.test(t.name))).toBe(false);
  });

  it("gives every tool a schema and a description the model can act on", () => {
    for (const tool of createAgentTools(makeDeps())) {
      expect(tool.schema, `${tool.name} needs a schema`).toBeDefined();
      expect(tool.description.length, `${tool.name} needs a description`).toBeGreaterThan(20);
    }
  });
});

describe("search_web", () => {
  it("passes the query through to the provider and returns typed results", async () => {
    const provider = new StubSearchProvider([
      { title: "Backend Engineer", url: LEVER_URL, snippet: "Acme" },
    ]);
    const result = await invoke(createSearchWebTool(makeDeps({ searchProvider: provider })), {
      query: 'site:jobs.lever.co "Backend Engineer"',
      role: "Backend Engineer",
      board: "lever",
      location: "Remote",
    });

    expect(provider.queries[0]).toMatchObject({ board: "lever", location: "Remote" });
    expect(result.content).toContain(LEVER_URL);
    expect(result.artifact).toMatchObject({ blocked: false });
  });

  it("reports a blocked engine as data so the agent can route around it", async () => {
    const provider = new StubSearchProvider(new Error("Google showed a CAPTCHA"));
    const result = await invoke(createSearchWebTool(makeDeps({ searchProvider: provider })), {
      query: "site:jobs.lever.co",
      role: "Backend Engineer",
      board: "lever",
    });

    expect(result.artifact).toMatchObject({ blocked: true, results: [] });
    expect(result.content).toMatch(/blocked.*CAPTCHA/i);
    expect(result.content).toMatch(/different board or provider/i);
  });

  it("rejects an unknown board through the schema", async () => {
    const tool = createSearchWebTool(makeDeps());
    await expect(invokeRaw(tool, { query: "q", role: "r", board: "monster" })).rejects.toThrow();
  });
});

describe("check_seen", () => {
  it("partitions URLs and marks nothing itself", async () => {
    const deps = makeDeps();
    deps.state.markSeen(LEVER_URL);
    const other = "https://jobs.lever.co/acme/2222bbbb-3333-cccc-4444-dddd5555eeee";

    const result = await invoke(createCheckSeenTool(deps), { urls: [`${LEVER_URL}?utm=x`, other] });
    expect(result.artifact).toEqual({ fresh: [other], seen: [`${LEVER_URL}?utm=x`] });
    // Pure query: the fresh URL is still unseen afterwards.
    expect(deps.state.hasSeen(other)).toBe(false);
  });

  it("requires at least one URL", async () => {
    await expect(invokeRaw(createCheckSeenTool(makeDeps()), { urls: [] })).rejects.toThrow();
  });
});

describe("fetch_job", () => {
  it("parses a posting, retains it internally and returns only a summary", async () => {
    const deps = makeDeps();
    const result = await invoke(createFetchJobTool(deps), { url: LEVER_URL });

    expect(result.artifact).toMatchObject({ parsed: true });
    expect(deps.state.getJob(LEVER_URL)).toBeDefined();
    expect(deps.state.hasSeen(LEVER_URL)).toBe(true);
    // The full description stays in run state, out of the model's context.
    expect(result.content.length).toBeLessThan(400);
  });

  it("reports an unsupported board as data and will not retry it", async () => {
    const deps = makeDeps();
    const result = await invoke(createFetchJobTool(deps), { url: "https://example.com/jobs/1" });

    expect(result.artifact).toMatchObject({ parsed: false, failure: "unsupported" });
    expect(deps.state.hasSeen("https://example.com/jobs/1")).toBe(true);
  });

  it("reports an unparseable page without aborting the run", async () => {
    const deps = makeDeps({
      parsers: [new LeverParser(new FakeHttpClient({ "https://jobs.lever.co": "<html></html>" }))],
    });
    const result = await invoke(createFetchJobTool(deps), { url: LEVER_URL });
    expect(result.artifact).toMatchObject({ parsed: false, failure: "unparseable" });
    expect(result.content).toMatch(/could not be parsed/i);
  });

  it("rejects a non-URL through the schema", async () => {
    await expect(invokeRaw(createFetchJobTool(makeDeps()), { url: "not-a-url" })).rejects.toThrow();
  });
});

describe("prefilter_score", () => {
  it("scores fetched jobs deterministically and ranks them", async () => {
    const deps = makeDeps();
    deps.state.putJob(LEVER_URL, makeJob());
    deps.state.putJob("https://jobs.lever.co/b/2", makeJob({ technologies: ["COBOL"] }));

    const result = await invoke(createPrefilterScoreTool(deps), {
      urls: [LEVER_URL, "https://jobs.lever.co/b/2"],
    });
    const artifact = result.artifact as { scored: Array<{ url: string; score: number }> };

    expect(artifact.scored).toHaveLength(2);
    expect(artifact.scored[0]?.score).toBeGreaterThan(artifact.scored[1]?.score ?? 0);
    expect(artifact.scored[0]?.url).toBe(LEVER_URL);
  });

  it("tells the agent which URLs it has not fetched yet", async () => {
    const result = await invoke(createPrefilterScoreTool(makeDeps()), { urls: [LEVER_URL] });
    expect(result.artifact).toMatchObject({ scored: [], missing: [LEVER_URL] });
    expect(result.content).toMatch(/fetch_job first/i);
  });
});

describe("record_finding", () => {
  it("records a fetched job and reports the running total", async () => {
    const deps = makeDeps();
    deps.state.putJob(LEVER_URL, makeJob());

    const result = await invoke(createRecordFindingTool(deps), {
      url: LEVER_URL,
      score: 91,
      note: "Strong overlap on Node.js and AWS",
    });

    expect(result.artifact).toMatchObject({ recorded: true, total: 1 });
    expect(deps.state.findings[0]).toMatchObject({ score: 91, company: "Acme" });
  });

  it("refuses to record a job that was never fetched", async () => {
    const deps = makeDeps();
    const result = await invoke(createRecordFindingTool(deps), { url: LEVER_URL, score: 91 });
    expect(result.artifact).toMatchObject({ recorded: false, total: 0 });
  });

  it("rejects an out-of-range score, so an injected 9999 cannot land", async () => {
    const deps = makeDeps();
    deps.state.putJob(LEVER_URL, makeJob());
    await expect(
      invokeRaw(createRecordFindingTool(deps), { url: LEVER_URL, score: 9999 }),
    ).rejects.toThrow();
    expect(deps.state.counts.findings).toBe(0);
  });
});
