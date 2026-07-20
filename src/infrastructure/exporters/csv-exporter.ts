import type { MatchResult } from "../../domain/matching/match-result.js";
import { categorize } from "../../domain/matching/match-result.js";
import type { Exporter } from "../../shared/interfaces/exporter.js";
import { toExportRow, writeOutput } from "./export-helpers.js";

const HEADERS = [
  "score",
  "category",
  "title",
  "company",
  "location",
  "remote",
  "seniority",
  "board",
  "url",
  "matchedSkills",
  "missingSkills",
] as const;

export class CsvExporter implements Exporter {
  readonly format = "csv" as const;

  constructor(
    private readonly outputDir: string,
    private readonly fileName = "results.csv",
  ) {}

  async export(results: MatchResult[]): Promise<void> {
    const lines = [HEADERS.join(",")];
    for (const result of results) {
      const row = toExportRow(result);
      lines.push(
        [
          row.score,
          categorize(result.score),
          csvEscape(row.title),
          csvEscape(row.company),
          csvEscape(row.location),
          row.remote,
          row.seniority,
          row.board,
          csvEscape(row.url),
          csvEscape(row.matchedSkills.join("; ")),
          csvEscape(row.missingSkills.join("; ")),
        ].join(","),
      );
    }
    await writeOutput(this.outputDir, this.fileName, `${lines.join("\n")}\n`);
  }
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
