import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SearchQuery } from "@domain/search/search-query.js";
import {
  GoogleSearchProvider,
  parseGoogleResultsPage,
} from "@infrastructure/providers/google-search-provider.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { FakeHttpClient, MemoryCache, nullLogger } from "../helpers/fakes.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const query: SearchQuery = {
  query: 'site:jobs.lever.co "Backend Engineer"',
  role: "Backend Engineer",
  board: "lever",
};

let html: string;
beforeAll(async () => {
  html = await readFile(path.join(fixturesDir, "google-results.html"), "utf-8");
});

describe("parseGoogleResultsPage", () => {
  it("extracts direct and /url?q= redirect links, skipping Google internals", () => {
    const results = parseGoogleResultsPage(html);
    const urls = results.map((r) => r.url);

    expect(urls).toContain("https://jobs.lever.co/acme/1111aaaa-2222-bbbb-3333-cccc4444dddd");
    expect(urls).toContain("https://boards.greenhouse.io/globex/jobs/4002");
    expect(urls).toContain("https://jobs.ashbyhq.com/initech/0f1e2d3c-4b5a-6978-8899-aabbccddeeff");
    expect(urls.every((u) => !u.includes("google.com"))).toBe(true);
  });
});

describe("GoogleSearchProvider (RF-006)", () => {
  it("searches and caches results", async () => {
    const http = new FakeHttpClient({ "https://www.google.com/search": html });
    const cache = new MemoryCache();
    const provider = new GoogleSearchProvider(http, cache, nullLogger);

    const first = await provider.search(query);
    expect(first.length).toBeGreaterThan(0);

    await provider.search(query);
    expect(http.requests).toHaveLength(1); // second call served from cache (§16)
  });

  it("fails with an actionable error when rate-limited", async () => {
    const http = new FakeHttpClient({
      "https://www.google.com/search": { status: 429, body: "unusual traffic" },
    });
    const provider = new GoogleSearchProvider(http, new MemoryCache(), nullLogger);
    await expect(provider.search(query)).rejects.toThrow(/rate-limiting/);
  });

  it("falls back to the default endpoint when GOOGLE_SEARCH_BASE_URL is empty", async () => {
    // .env templates ship GOOGLE_SEARCH_BASE_URL= (empty); that must not
    // produce relative "?q=..." request URLs.
    vi.stubEnv("GOOGLE_SEARCH_BASE_URL", "");
    try {
      const http = new FakeHttpClient({ "https://www.google.com/search": html });
      const provider = new GoogleSearchProvider(http, new MemoryCache(), nullLogger);
      await provider.search(query);
      expect(http.requests[0]).toMatch(/^https:\/\/www\.google\.com\/search\?q=/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("fails with an actionable error on the JavaScript-required page", async () => {
    const http = new FakeHttpClient({
      "https://www.google.com/search":
        '<html><body><div id="enablejs">Please click here if you are not redirected</div></body></html>',
    });
    const provider = new GoogleSearchProvider(http, new MemoryCache(), nullLogger);
    await expect(provider.search(query)).rejects.toThrow(/JavaScript-required/);
  });

  it("fails on HTTP errors", async () => {
    const http = new FakeHttpClient({
      "https://www.google.com/search": { status: 500, body: "boom" },
    });
    const provider = new GoogleSearchProvider(http, new MemoryCache(), nullLogger);
    await expect(provider.search(query)).rejects.toThrow(/HTTP 500/);
  });
});
