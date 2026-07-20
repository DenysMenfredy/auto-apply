import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MatchResult } from "../../domain/matching/match-result.js";

export async function writeOutput(dir: string, fileName: string, content: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), content, "utf-8");
}

/** Flat, serialization-friendly view of a MatchResult shared by exporters. */
export interface ExportRow {
  score: number;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  seniority: string;
  board: string;
  url: string;
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  weaknesses: string[];
}

export function toExportRow(result: MatchResult): ExportRow {
  return {
    score: result.score,
    title: result.job.title,
    company: result.job.company,
    location: result.job.location || (result.job.remote ? "Remote" : ""),
    remote: result.job.remote,
    seniority: result.job.seniority,
    board: result.job.board,
    url: result.job.url,
    matchedSkills: result.matchedSkills,
    missingSkills: result.missingSkills,
    strengths: result.strengths,
    weaknesses: result.weaknesses,
  };
}
