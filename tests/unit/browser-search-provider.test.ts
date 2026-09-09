import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SearchQuery } from "@domain/search/search-query.js";
import type { BrowserEngine, FetchedPage } from "@infrastructure/providers/browser-engine.js";
import { BrowserSearchProvider } from "@infrastructure/providers/browser-search-provider.js";
import { beforeAll, describe, expect, it } from "vitest";
import { MemoryCache, nullLogger } from "../helpers/fakes.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const query: SearchQuery = {
  query: 'site:jobs.lever.co "Backend Engineer"',
  role: "Backend Engineer",
  board: "lever",
};

class FakeEngine implements BrowserEngine {
  readonly requests: string[] = [];
  closed = false;

  constructor(private readonly page: FetchedPage) {}

  fetchPage(url: string): Promise<FetchedPage> {
    this.requests.push(url);
    return Promise.resolve(this.page);
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

function makeProvider(engine: BrowserEngine): BrowserSearchProvider {
  return new BrowserSearchProvider(new MemoryCache(), nullLogger, { engine, minDelayMs: 0 });
}

let html: string;
beforeAll(async () => {
  html = await readFile(path.join(fixturesDir, "google-results.html"), "utf-8");
});

describe("BrowserSearchProvider (RF-006)", () => {
  it("renders the results page and returns an array of {title, url} objects", async () => {
    const engine = new FakeEngine({ html, finalUrl: "https://www.google.com/search?q=x" });
    const results = await makeProvider(engine).search(query);

    expect(results.length).toBeGreaterThan(0);
    expect(results.map((r) => r.url)).toContain(
      "https://jobs.lever.co/acme/1111aaaa-2222-bbbb-3333-cccc4444dddd",
    );
    expect(engine.requests[0]).toContain("q=site%3Ajobs.lever.co");
    expect(engine.requests[0]).toContain("num=10");
  });

  it("serves repeated queries from the cache (§16)", async () => {
    const engine = new FakeEngine({ html, finalUrl: "https://www.google.com/search?q=x" });
    const provider = makeProvider(engine);

    await provider.search(query);
    await provider.search(query);
    expect(engine.requests).toHaveLength(1);
  });

  it("fails actionably when Google shows a CAPTCHA page", async () => {
    const engine = new FakeEngine({
      html: "<html><body>Our systems have detected unusual traffic</body></html>",
      finalUrl: "https://www.google.com/sorry/index",
    });
    await expect(makeProvider(engine).search(query)).rejects.toThrow(/AUTOAPPLY_BROWSER_HEADED/);
  });

  it("fails actionably when redirected to the consent screen", async () => {
    const engine = new FakeEngine({
      html: "<html><body>Before you continue</body></html>",
      finalUrl: "https://consent.google.com/m?continue=...",
    });
    await expect(makeProvider(engine).search(query)).rejects.toThrow(/consent/);
  });

  it("closes the underlying browser engine", async () => {
    const engine = new FakeEngine({ html, finalUrl: "https://www.google.com/search?q=x" });
    const provider = makeProvider(engine);
    await provider.close();
    expect(engine.closed).toBe(true);
  });
});
