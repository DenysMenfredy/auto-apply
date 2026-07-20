import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LinkedInPublicProfileSource } from "@infrastructure/sources/linkedin-public-profile-source.js";
import { beforeAll, describe, expect, it } from "vitest";
import { FakeHttpClient } from "../helpers/fakes.js";

const PROFILE_URL = "https://www.linkedin.com/in/janedoe";

let html: string;
beforeAll(async () => {
  html = await readFile(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "fixtures",
      "linkedin-public-profile.html",
    ),
    "utf-8",
  );
});

describe("LinkedInPublicProfileSource", () => {
  it("parses JSON-LD Person data and guest-page experience", async () => {
    const source = new LinkedInPublicProfileSource(
      PROFILE_URL,
      new FakeHttpClient({ "https://www.linkedin.com": html }),
    );
    const profile = await source.parse();

    expect(profile.name).toBe("Jane Doe");
    expect(profile.headline).toBe("Senior Backend Engineer at Acme");
    expect(profile.summary).toContain("7 years of experience");
    expect(profile.languages).toEqual(["English", "Portuguese"]);

    expect(profile.experience).toHaveLength(2);
    expect(profile.experience?.[0]).toMatchObject({
      title: "Senior Backend Engineer",
      company: "Acme",
      startDate: "2021",
      endDate: "Present",
    });
    expect(profile.experience?.[0]?.technologies).toEqual(
      expect.arrayContaining(["Node.js", "AWS", "PostgreSQL", "Redis"]),
    );

    expect(profile.education).toEqual([
      { institution: "State University", degree: "BSc Computer Science" },
    ]);
    expect(profile.technologies).toEqual(expect.arrayContaining(["Node.js", "TypeScript", "LLM"]));
  });

  it("fails actionably on the authwall (HTTP 999)", async () => {
    const source = new LinkedInPublicProfileSource(
      PROFILE_URL,
      new FakeHttpClient({ "https://www.linkedin.com": { status: 999, body: "denied" } }),
    );
    await expect(source.parse()).rejects.toThrow(/authwall.*Get a copy of your data/s);
  });

  it("detects the authwall redirect page even with HTTP 200", async () => {
    const source = new LinkedInPublicProfileSource(
      PROFILE_URL,
      new FakeHttpClient({
        "https://www.linkedin.com": "<html><head><title>Sign Up | LinkedIn</title></head></html>",
      }),
    );
    await expect(source.parse()).rejects.toThrow(/authwall/);
  });

  it("fails when the page has no extractable profile data", async () => {
    const source = new LinkedInPublicProfileSource(
      PROFILE_URL,
      new FakeHttpClient({ "https://www.linkedin.com": "<html><body>nothing here</body></html>" }),
    );
    await expect(source.parse()).rejects.toThrow(/No profile data found/);
  });

  it("rejects non-LinkedIn and non-profile URLs upfront", async () => {
    const http = new FakeHttpClient({});
    await expect(
      new LinkedInPublicProfileSource("https://example.com/in/x", http).parse(),
    ).rejects.toThrow(/not a linkedin\.com URL/);
    await expect(
      new LinkedInPublicProfileSource("https://www.linkedin.com/company/acme", http).parse(),
    ).rejects.toThrow(/linkedin\.com\/in\//);
    await expect(new LinkedInPublicProfileSource("not-a-url", http).parse()).rejects.toThrow(
      /not a valid URL/,
    );
  });
});
