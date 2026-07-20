import { readFile } from "node:fs/promises";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import type { CandidateProfile } from "../../domain/candidate/candidate-profile.js";
import type { ProfileSource } from "../../shared/interfaces/profile-source.js";
import { parseResumeText } from "./resume-text-parser.js";

/** Extracts candidate data from a PDF resume (RF-002). */
export class ResumePdfSource implements ProfileSource {
  readonly name = "resume-pdf";

  constructor(private readonly filePath: string) {}

  async parse(): Promise<Partial<CandidateProfile>> {
    let buffer: Buffer;
    try {
      buffer = await readFile(this.filePath);
    } catch {
      throw new Error(`Resume PDF not found at "${this.filePath}".`);
    }

    const { text } = await pdfParse(buffer);
    if (!text.trim()) {
      throw new Error(
        `Resume PDF at "${this.filePath}" contains no extractable text (scanned image?).`,
      );
    }
    return parseResumeText(text);
  }
}
