import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AshbyParser } from "@infrastructure/parser/ashby/ashby-parser.js";
import { BambooHrParser } from "@infrastructure/parser/bamboohr/bamboohr-parser.js";
import { GreenhouseParser } from "@infrastructure/parser/greenhouse/greenhouse-parser.js";
import { LeverParser } from "@infrastructure/parser/lever/lever-parser.js";
import { WorkableParser } from "@infrastructure/parser/workable/workable-parser.js";
import { describe, expect, it } from "vitest";
import { FakeHttpClient } from "../helpers/fakes.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

async function fixture(name: string): Promise<string> {
  return readFile(path.join(fixturesDir, name), "utf-8");
}

describe("LeverParser", () => {
  const url = new URL("https://jobs.lever.co/acme/1111aaaa-2222-bbbb-3333-cccc4444dddd");

  it("parses a posting from server-rendered markup", async () => {
    const parser = new LeverParser(
      new FakeHttpClient({ "https://jobs.lever.co": await fixture("lever.html") }),
    );
    expect(parser.supports(url)).toBe(true);

    const job = await parser.parse(url);
    expect(job).toMatchObject({
      title: "Senior Backend Engineer",
      company: "Acme",
      board: "lever",
      remote: true,
      employmentType: "full-time",
      seniority: "senior",
    });
    expect(job.location).toContain("Remote - LATAM");
    expect(job.technologies).toEqual(
      expect.arrayContaining(["Node.js", "TypeScript", "AWS", "Docker", "PostgreSQL"]),
    );
    expect(job.requirements.length).toBeGreaterThan(0);
    expect(job.responsibilities.length).toBeGreaterThan(0);
    expect(job.salary).toMatchObject({ min: 140000, max: 180000, currency: "USD" });
  });

  it("fails with an actionable error on 404", async () => {
    const parser = new LeverParser(new FakeHttpClient({}));
    await expect(parser.parse(url)).rejects.toThrow(/404/);
  });
});

describe("GreenhouseParser", () => {
  it("prefers JSON-LD JobPosting data", async () => {
    const url = new URL("https://boards.greenhouse.io/globex/jobs/4002");
    const parser = new GreenhouseParser(
      new FakeHttpClient({ "https://boards.greenhouse.io": await fixture("greenhouse.html") }),
    );
    expect(parser.supports(url)).toBe(true);

    const job = await parser.parse(url);
    expect(job).toMatchObject({
      title: "AI Engineer",
      company: "Globex",
      board: "greenhouse",
      remote: true,
      employmentType: "full-time",
    });
    expect(job.location).toContain("Berlin");
    expect(job.technologies).toEqual(
      expect.arrayContaining(["Python", "LLM", "LangChain", "AWS", "RAG"]),
    );
    expect(job.requirements.some((r) => r.includes("3+ years"))).toBe(true);
  });
});

describe("AshbyParser", () => {
  it("parses JSON-LD with OpenGraph fallbacks", async () => {
    const url = new URL("https://jobs.ashbyhq.com/initech/0f1e2d3c-4b5a-6978-8899-aabbccddeeff");
    const parser = new AshbyParser(
      new FakeHttpClient({ "https://jobs.ashbyhq.com": await fixture("ashby.html") }),
    );
    expect(parser.supports(url)).toBe(true);

    const job = await parser.parse(url);
    expect(job).toMatchObject({
      title: "Machine Learning Engineer",
      company: "Initech",
      board: "ashby",
      remote: true,
    });
    expect(job.technologies).toEqual(
      expect.arrayContaining(["Machine Learning", "PyTorch", "LLM", "Python"]),
    );
  });
});

describe("WorkableParser", () => {
  it("parses apply.workable.com postings", async () => {
    const url = new URL("https://apply.workable.com/umbrella/j/ABC123/");
    const parser = new WorkableParser(
      new FakeHttpClient({ "https://apply.workable.com": await fixture("workable.html") }),
    );
    expect(parser.supports(url)).toBe(true);

    const job = await parser.parse(url);
    expect(job).toMatchObject({
      title: "Full Stack Engineer",
      company: "Umbrella",
      board: "workable",
      employmentType: "full-time",
    });
    expect(job.location).toContain("Lisbon");
    expect(job.technologies).toEqual(expect.arrayContaining(["React", "Node.js", "PostgreSQL"]));
  });
});

describe("BambooHrParser", () => {
  it("parses company-subdomain careers pages", async () => {
    const url = new URL("https://hooli.bamboohr.com/careers/42");
    const parser = new BambooHrParser(
      new FakeHttpClient({ "https://hooli.bamboohr.com": await fixture("bamboohr.html") }),
    );
    expect(parser.supports(url)).toBe(true);

    const job = await parser.parse(url);
    expect(job).toMatchObject({
      title: "Software Engineer",
      company: "Hooli",
      board: "bamboohr",
      employmentType: "full-time",
    });
    expect(job.location).toContain("Austin");
    expect(job.technologies).toEqual(
      expect.arrayContaining(["Go", "TypeScript", "Docker", "Kubernetes"]),
    );
  });
});
