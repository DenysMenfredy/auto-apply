import type { MatchResult } from "../domain/matching/match-result.js";
import type { Exporter } from "../shared/interfaces/exporter.js";
import type { Logger } from "../shared/interfaces/logger.js";
import type { ExportFormat } from "../shared/types/common.js";

/** Exports ranked results in every requested format (RF-011). */
export class ExportResultsUseCase {
  constructor(
    private readonly exporters: Exporter[],
    private readonly logger: Logger,
  ) {}

  async execute(results: MatchResult[], formats: ExportFormat[]): Promise<void> {
    for (const format of formats) {
      const exporter = this.exporters.find((e) => e.format === format);
      if (!exporter) {
        throw new Error(
          `No exporter registered for format "${format}". Available: ${this.exporters
            .map((e) => e.format)
            .join(", ")}`,
        );
      }
      await exporter.export(results);
    }
    this.logger.info("Export completed", { formats, results: results.length });
  }
}
