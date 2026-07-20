import type { MatchResult } from "../../domain/matching/match-result.js";
import { categorize } from "../../domain/matching/match-result.js";
import type { Exporter } from "../../shared/interfaces/exporter.js";
import { toExportRow, writeOutput } from "./export-helpers.js";

export class JsonExporter implements Exporter {
  readonly format = "json" as const;

  constructor(
    private readonly outputDir: string,
    private readonly fileName = "results.json",
  ) {}

  async export(results: MatchResult[]): Promise<void> {
    const payload = results.map((result) => ({
      ...toExportRow(result),
      category: categorize(result.score),
    }));
    await writeOutput(this.outputDir, this.fileName, `${JSON.stringify(payload, null, 2)}\n`);
  }
}
