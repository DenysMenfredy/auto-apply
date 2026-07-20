import path from "node:path";
import { fileURLToPath } from "node:url";
import { LinkedInSource } from "@infrastructure/sources/linkedin-source.js";
import { describe, expect, it } from "vitest";

const fixture = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "linkedin-export.json",
);

describe("LinkedInSource (RF-003)", () => {
  it("parses the JSON export", async () => {
    const profile = await new LinkedInSource(fixture).parse();

    expect(profile.name).toBe("Jane Doe");
    expect(profile.headline).toContain("Senior Backend Engineer");
    expect(profile.skills).toEqual(
      expect.arrayContaining(["Node.js", "TypeScript", "AWS", "PostgreSQL", "Leadership"]),
    );
    expect(profile.experience).toHaveLength(2);
    expect(profile.experience?.[0]).toMatchObject({
      title: "Senior Backend Engineer",
      company: "Acme",
    });
    expect(profile.experience?.[0]?.technologies).toEqual(
      expect.arrayContaining(["Node.js", "AWS", "PostgreSQL", "Redis"]),
    );
    expect(profile.certifications).toEqual(["AWS Certified Solutions Architect"]);
  });

  it("fails with an actionable error for a missing file", async () => {
    await expect(new LinkedInSource("/nope/missing.json").parse()).rejects.toThrow(
      /not found at "\/nope\/missing.json"/,
    );
  });

  it("fails with an actionable error for invalid JSON", async () => {
    const invalid = path.join(path.dirname(fixture), "..", "fixtures", "lever.html");
    await expect(new LinkedInSource(invalid).parse()).rejects.toThrow(/not valid JSON/);
  });
});
