import { detectBoard, isJobPostingUrl } from "@domain/job/boards.js";
import { collectJobUrls } from "@domain/search/url-collector.js";
import { describe, expect, it } from "vitest";

const LEVER_JOB = "https://jobs.lever.co/acme/1111aaaa-2222-bbbb-3333-cccc4444dddd";

describe("detectBoard", () => {
  it.each([
    ["https://jobs.ashbyhq.com/initech/0f1e2d3c-4b5a-6978-8899-aabbccddeeff", "ashby"],
    ["https://boards.greenhouse.io/globex/jobs/4002", "greenhouse"],
    ["https://job-boards.greenhouse.io/globex/jobs/4002", "greenhouse"],
    [LEVER_JOB, "lever"],
    ["https://apply.workable.com/umbrella/j/ABC123/", "workable"],
    ["https://hooli.bamboohr.com/careers/42", "bamboohr"],
  ])("%s -> %s", (url, board) => {
    expect(detectBoard(new URL(url))).toBe(board);
  });

  it("returns null for unsupported domains", () => {
    expect(detectBoard(new URL("https://example.com/jobs/1"))).toBeNull();
    // must not match lookalike domains
    expect(
      detectBoard(new URL("https://evil-boards.greenhouse.io.attacker.com/x/jobs/1")),
    ).toBeNull();
  });
});

describe("isJobPostingUrl", () => {
  it("distinguishes postings from board indexes", () => {
    expect(isJobPostingUrl(new URL(LEVER_JOB))).toBe(true);
    expect(isJobPostingUrl(new URL("https://jobs.lever.co/acme"))).toBe(false);
    expect(isJobPostingUrl(new URL("https://boards.greenhouse.io/globex"))).toBe(false);
  });
});

describe("collectJobUrls (RF-007)", () => {
  it("validates, filters and deduplicates URLs", () => {
    const collected = collectJobUrls([
      { title: "A", url: LEVER_JOB },
      { title: "A dup with tracking", url: `${LEVER_JOB}?lever-origin=applied#apply` },
      { title: "Invalid", url: "not a url" },
      { title: "Unsupported", url: "https://example.com/careers/1" },
      { title: "Index page", url: "https://jobs.lever.co/acme" },
      { title: "B", url: "https://boards.greenhouse.io/globex/jobs/4002" },
    ]);

    expect(collected).toHaveLength(2);
    expect(collected[0]?.board).toBe("lever");
    expect(collected[0]?.url.toString()).toBe(LEVER_JOB);
    expect(collected[1]?.board).toBe("greenhouse");
  });
});
