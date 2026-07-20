import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CsvExporter } from "@infrastructure/exporters/csv-exporter.js";
import { JsonExporter } from "@infrastructure/exporters/json-exporter.js";
import { MarkdownExporter } from "@infrastructure/exporters/markdown-exporter.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeCandidate, makeJob } from "../helpers/fakes.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "autoapply-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const results = [
  {
    job: makeJob({ title: 'Engineer, "Platform"' }),
    candidate: makeCandidate(),
    score: 92,
    matchedSkills: ["Node.js"],
    missingSkills: ["Kafka"],
    strengths: ["Relevant backend experience"],
    weaknesses: ["Missing: Kafka"],
  },
  {
    job: makeJob({ title: "Data Engineer" }),
    candidate: makeCandidate(),
    score: 65,
    matchedSkills: [],
    missingSkills: ["Spark"],
    strengths: [],
    weaknesses: [],
  },
];

describe("JsonExporter", () => {
  it("writes ranked results with categories", async () => {
    await new JsonExporter(dir).export(results);
    const parsed = JSON.parse(await readFile(path.join(dir, "results.json"), "utf-8"));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      score: 92,
      category: "excellent",
      title: 'Engineer, "Platform"',
    });
  });
});

describe("CsvExporter", () => {
  it("escapes quotes and commas", async () => {
    await new CsvExporter(dir).export(results);
    const csv = await readFile(path.join(dir, "results.csv"), "utf-8");
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("score,category,title");
    expect(lines[1]).toContain('"Engineer, ""Platform"""');
  });
});

describe("MarkdownExporter", () => {
  it("groups results by category", async () => {
    await new MarkdownExporter(dir).export(results);
    const md = await readFile(path.join(dir, "results.md"), "utf-8");
    expect(md).toContain("## Excellent (90-100)");
    expect(md).toContain("## Below 70");
    expect(md).toContain("### 92 —");
  });

  it("handles empty result sets", async () => {
    await new MarkdownExporter(dir).export([]);
    const md = await readFile(path.join(dir, "results.md"), "utf-8");
    expect(md).toContain("No opportunities found.");
  });
});
