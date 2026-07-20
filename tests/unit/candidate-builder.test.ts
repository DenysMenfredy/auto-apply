import { CandidateProfileBuilder } from "@domain/candidate/candidate-builder.js";
import { describe, expect, it } from "vitest";

describe("CandidateProfileBuilder", () => {
  it("merges sources with first-source priority for scalars", () => {
    const profile = new CandidateProfileBuilder()
      .add({ name: "Jane Doe", summary: "" })
      .add({ name: "J. Doe", summary: "From LinkedIn", headline: "Backend Engineer" })
      .build();

    expect(profile.name).toBe("Jane Doe");
    expect(profile.summary).toBe("From LinkedIn"); // fills the gap
    expect(profile.headline).toBe("Backend Engineer");
  });

  it("deduplicates skills across sources (RF-004)", () => {
    const profile = new CandidateProfileBuilder()
      .add({ skills: ["Node.js", "AWS"] })
      .add({ skills: ["nodejs", "aws", "Python"] })
      .build();

    expect(profile.skills).toEqual(["Node.js", "AWS", "Python"]);
  });

  it("merges duplicate experience entries keeping the richer description", () => {
    const profile = new CandidateProfileBuilder()
      .add({
        experience: [
          {
            title: "Backend Engineer",
            company: "Acme",
            technologies: ["Node.js"],
            description: "APIs",
          },
        ],
      })
      .add({
        experience: [
          {
            title: "Backend Engineer",
            company: "acme",
            technologies: ["PostgreSQL"],
            description: "Built payment APIs with Node.js",
            startDate: "2019",
            endDate: "2022",
          },
          { title: "Intern", company: "Globex", technologies: [] },
        ],
      })
      .build();

    expect(profile.experience).toHaveLength(2);
    const acme = profile.experience.find((e) => e.company.toLowerCase() === "acme");
    expect(acme?.description).toBe("Built payment APIs with Node.js");
    expect(acme?.technologies).toEqual(["Node.js", "PostgreSQL"]);
  });

  it("estimates years of experience from date ranges", () => {
    const profile = new CandidateProfileBuilder()
      .add({
        experience: [
          {
            title: "Engineer",
            company: "A",
            startDate: "2018-01",
            endDate: "2021-05",
            technologies: [],
          },
          {
            title: "Senior Engineer",
            company: "B",
            startDate: "2021-06",
            endDate: "Present",
            technologies: [],
          },
        ],
      })
      .build();

    expect(profile.yearsExperience).toBe(new Date().getFullYear() - 2018);
  });

  it("infers seniority from titles first, then years", () => {
    const fromTitle = new CandidateProfileBuilder()
      .add({ headline: "Staff Engineer at Acme" })
      .build();
    expect(fromTitle.seniority).toBe("staff");

    const fromYears = new CandidateProfileBuilder().add({ yearsExperience: 5 }).build();
    expect(fromYears.seniority).toBe("senior");
  });

  it("generates an id when none is provided", () => {
    expect(new CandidateProfileBuilder().add({ name: "X" }).build().id).toBeTruthy();
  });
});
