import { parseResumeText } from "@infrastructure/sources/resume-text-parser.js";
import { describe, expect, it } from "vitest";

const RESUME = `Jane Doe
Senior Backend Engineer

Summary
Backend engineer with 7 years of experience designing APIs and LLM features.

Experience
Senior Backend Engineer at Acme 2021 - Present
Built Node.js microservices on AWS with PostgreSQL.
Backend Engineer | Globex | 2018 - 2021
Developed REST APIs with Python and Django.

Skills
Node.js, TypeScript, Python, AWS, PostgreSQL, Docker

Education
BSc Computer Science, State University, 2014 - 2018

Certifications
AWS Certified Solutions Architect

Languages
English, Portuguese
`;

describe("parseResumeText (RF-002)", () => {
  const profile = parseResumeText(RESUME);

  it("extracts name and headline", () => {
    expect(profile.name).toBe("Jane Doe");
    expect(profile.headline).toBe("Senior Backend Engineer");
  });

  it("extracts the summary section", () => {
    expect(profile.summary).toContain("7 years of experience");
  });

  it("extracts and normalizes skills", () => {
    expect(profile.skills).toEqual(
      expect.arrayContaining(["Node.js", "TypeScript", "Python", "AWS", "PostgreSQL", "Docker"]),
    );
  });

  it("extracts technologies from the whole text", () => {
    expect(profile.technologies).toEqual(expect.arrayContaining(["Node.js", "LLM", "Django"]));
  });

  it("extracts experience entries with titles, companies and dates", () => {
    expect(profile.experience).toHaveLength(2);
    expect(profile.experience?.[0]).toMatchObject({
      title: "Senior Backend Engineer",
      company: "Acme",
      startDate: "2021",
    });
    expect(profile.experience?.[1]?.company).toBe("Globex");
  });

  it("uses the explicit years-of-experience claim", () => {
    expect(profile.yearsExperience).toBe(7);
  });

  it("extracts certifications and languages", () => {
    expect(profile.certifications).toEqual(["AWS Certified Solutions Architect"]);
    expect(profile.languages).toEqual(["English", "Portuguese"]);
  });

  it("infers seniority", () => {
    expect(profile.seniority).toBe("senior");
  });
});
