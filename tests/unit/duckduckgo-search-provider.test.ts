import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SearchQuery } from "@domain/search/search-query.js";
import {
  DuckDuckGoSearchProvider,
  parseDuckDuckGoResultsPage,
} from "@infrastructure/providers/duckduckgo-search-provider.js";
import { beforeAll, describe, expect, it } from "vitest";
import { FakeHttpClient, MemoryCache, nullLogger } from "../helpers/fakes.js";

const query: SearchQuery = {
  query: 'site:jobs.lever.co "Backend Engineer"',
  role: "Backend Engineer",
  board: "lever",
};

let html: string;
beforeAll(async () => {
  html = await readFile(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "fixtures",
      "duckduckgo-results.html",
    ),
    "utf-8",
  );
});

describe("parseDuckDuckGoResultsPage", () => {
  it("decodes uddg redirect links and keeps direct links, deduplicated", () => {
    const results = parseDuckDuckGoResultsPage(html);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: "Senior Backend Engineer - Acme",
      url: "https://jobs.lever.co/acme/1111aaaa-2222-bbbb-3333-cccc4444dddd",
    });
    expect(results[0]?.snippet).toContain("Acme is hiring");
    expect(results[1]?.url).toBe("https://boards.greenhouse.io/globex/jobs/4002");
  });
});

describe("DuckDuckGoSearchProvider", () => {
  it("searches and caches results", async () => {
    const http = new FakeHttpClient({ "https://html.duckduckgo.com/html/": html });
    const provider = new DuckDuckGoSearchProvider(http, new MemoryCache(), nullLogger);

    const first = await provider.search(query);
    expect(first).toHaveLength(2);

    await provider.search(query);
    expect(http.requests).toHaveLength(1);
  });

  it("fails actionably on the bot challenge (HTTP 202)", async () => {
    const http = new FakeHttpClient({
      "https://html.duckduckgo.com/html/": { status: 202, body: "anomaly-modal challenge" },
    });
    const provider = new DuckDuckGoSearchProvider(http, new MemoryCache(), nullLogger);
    await expect(provider.search(query)).rejects.toThrow(/bot-challenging.*google-cse/s);
  });

  it("fails on HTTP errors", async () => {
    const http = new FakeHttpClient({
      "https://html.duckduckgo.com/html/": { status: 500, body: "boom" },
    });
    const provider = new DuckDuckGoSearchProvider(http, new MemoryCache(), nullLogger);
    await expect(provider.search(query)).rejects.toThrow(/HTTP 500/);
  });
});
