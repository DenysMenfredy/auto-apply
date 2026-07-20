import type { MatchResult } from "../../domain/matching/match-result.js";
import type { ExportFormat } from "../types/common.js";

/** Writes ranked match results to an output destination (file, Notion, ...). */
export interface Exporter {
  readonly format: ExportFormat;
  export(results: MatchResult[]): Promise<void>;
}
