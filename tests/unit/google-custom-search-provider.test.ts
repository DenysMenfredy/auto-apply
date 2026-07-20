import type { SearchQuery } from "@domain/search/search-query.js";
import {
  GoogleCustomSearchProvider,
  parseCustomSearchResponse,
} from "@infrastructure/providers/google-custom-search-provider.js";
import { describe, expect, it, vi } from "vitest";
import { FakeHttpClient, MemoryCache, nullLogger } from "../helpers/fakes.js";

const query: SearchQuery = {
  query: 'site:jobs.lever.co "Backend Engineer"',
  role: "Backend Engineer",
  board: "lever",
};

const API_RESPONSE = JSON.stringify({
  items: [
    {
      title: "Senior Backend Engineer - Acme",
      link: "https://jobs.lever.co/acme/1111aaaa-2222-bbbb-3333-cccc4444dddd",
      snippet: "Acme is hiring.",
    },
    { title: "AI Engineer - Globex", link: "https://boards.greenhouse.io/globex/jobs/4002" },
    { title: "junk", link: 42 },
  ],
});

const configured = { apiKey: "test-key", engineId: "test-cx" };

describe("parseCustomSearchResponse", () => {
  it("maps items to search results, skipping malformed entries", () => {
    const results = parseCustomSearchResponse(API_RESPONSE);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: "Senior Backend Engineer - Acme",
      url: "https://jobs.lever.co/acme/1111aaaa-2222-bbbb-3333-cccc4444dddd",
      snippet: "Acme is hiring.",
    });
  });

  it("returns empty for responses without items", () => {
    expect(parseCustomSearchResponse("{}")).toEqual([]);
  });
});

describe("GoogleCustomSearchProvider", () => {
  it("fails with setup instructions when unconfigured (including empty .env values)", async () => {
    vi.stubEnv("GOOGLE_CSE_API_KEY", "");
    vi.stubEnv("GOOGLE_CSE_ID", "");
    try {
      const provider = new GoogleCustomSearchProvider(
        new FakeHttpClient({}),
        new MemoryCache(),
        nullLogger,
      );
      await expect(provider.search(query)).rejects.toThrow(/programmablesearchengine\.google\.com/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("searches and caches results", async () => {
    const http = new FakeHttpClient({ "https://www.googleapis.com/customsearch/v1": API_RESPONSE });
    const provider = new GoogleCustomSearchProvider(
      http,
      new MemoryCache(),
      nullLogger,
      configured,
    );

    const results = await provider.search(query);
    expect(results).toHaveLength(2);
    expect(http.requests[0]).toContain("key=test-key");
    expect(http.requests[0]).toContain("cx=test-cx");

    await provider.search(query);
    expect(http.requests).toHaveLength(1);
  });

  it("fails actionably when the daily quota is exhausted", async () => {
    const http = new FakeHttpClient({
      "https://www.googleapis.com/customsearch/v1": { status: 429, body: "{}" },
    });
    const provider = new GoogleCustomSearchProvider(
      http,
      new MemoryCache(),
      nullLogger,
      configured,
    );
    await expect(provider.search(query)).rejects.toThrow(/quota/);
  });

  it("surfaces API error messages", async () => {
    const http = new FakeHttpClient({
      "https://www.googleapis.com/customsearch/v1": {
        status: 400,
        body: JSON.stringify({ error: { message: "API key not valid" } }),
      },
    });
    const provider = new GoogleCustomSearchProvider(
      http,
      new MemoryCache(),
      nullLogger,
      configured,
    );
    await expect(provider.search(query)).rejects.toThrow(/API key not valid/);
  });
});
