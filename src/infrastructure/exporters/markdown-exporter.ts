import type { MatchResult } from "../../domain/matching/match-result.js";
import { type MatchCategory, categorize } from "../../domain/matching/match-result.js";
import type { Exporter } from "../../shared/interfaces/exporter.js";
import { toExportRow, writeOutput } from "./export-helpers.js";

const CATEGORY_TITLES: Record<MatchCategory, string> = {
  excellent: "Excellent (90-100)",
  "very-good": "Very Good (80-89)",
  good: "Good (70-79)",
  discard: "Below 70",
};

export class MarkdownExporter implements Exporter {
  readonly format = "markdown" as const;

  constructor(
    private readonly outputDir: string,
    private readonly fileName = "results.md",
  ) {}

  async export(results: MatchResult[]): Promise<void> {
    const sections: string[] = ["# AutoApply — Ranked Opportunities", ""];

    for (const category of ["excellent", "very-good", "good", "discard"] as const) {
      const group = results.filter((r) => categorize(r.score) === category);
      if (group.length === 0) continue;

      sections.push(`## ${CATEGORY_TITLES[category]}`, "");
      for (const result of group) {
        const row = toExportRow(result);
        sections.push(
          `### ${row.score} — [${row.title}](${row.url})`,
          "",
          `- **Company:** ${row.company || "unknown"}`,
          `- **Location:** ${row.location || "unknown"}${row.remote ? " (Remote)" : ""}`,
          `- **Board:** ${row.board}`,
        );
        if (row.matchedSkills.length > 0) {
          sections.push(`- **Matched skills:** ${row.matchedSkills.join(", ")}`);
        }
        if (row.missingSkills.length > 0) {
          sections.push(`- **Missing skills:** ${row.missingSkills.join(", ")}`);
        }
        for (const strength of row.strengths) sections.push(`- ✅ ${strength}`);
        for (const weakness of row.weaknesses) sections.push(`- ⚠️ ${weakness}`);
        sections.push("");
      }
    }

    if (results.length === 0) sections.push("No opportunities found.");
    await writeOutput(this.outputDir, this.fileName, `${sections.join("\n")}\n`);
  }
}
