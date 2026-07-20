import { readFile } from "node:fs/promises";
import { z } from "zod";
import type {
  CandidateProfile,
  ExperienceEntry,
} from "../../domain/candidate/candidate-profile.js";
import { extractTechnologies } from "../../domain/matching/normalization.js";
import type { ProfileSource } from "../../shared/interfaces/profile-source.js";

/**
 * LinkedIn JSON export parser (RF-003). HTML / public profile / API support
 * arrives in future versions.
 *
 * The schema is deliberately lenient: LinkedIn export shapes drift, and
 * losing one optional field must not fail the whole profile.
 */
const nameValue = z.union([z.string(), z.object({ name: z.string() }).transform((s) => s.name)]);

const experienceItem = z
  .object({
    title: z.string().default(""),
    companyName: z.string().optional(),
    company: z.string().optional(),
    description: z.string().optional(),
    startDate: z.union([z.string(), z.number()]).optional(),
    endDate: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const linkedInExportSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    name: z.string().optional(),
    headline: z.string().optional(),
    summary: z.string().optional(),
    about: z.string().optional(),
    skills: z.array(nameValue).default([]),
    certifications: z.array(nameValue).default([]),
    languages: z.array(nameValue).default([]),
    positions: z.array(experienceItem).optional(),
    experience: z.array(experienceItem).optional(),
  })
  .passthrough();

export class LinkedInSource implements ProfileSource {
  readonly name = "linkedin-json";

  constructor(private readonly filePath: string) {}

  async parse(): Promise<Partial<CandidateProfile>> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf-8");
    } catch {
      throw new Error(`LinkedIn export not found at "${this.filePath}".`);
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`LinkedIn export at "${this.filePath}" is not valid JSON.`);
    }

    const parsed = linkedInExportSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `LinkedIn export at "${this.filePath}" has an unexpected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      );
    }
    const data = parsed.data;

    const experience: ExperienceEntry[] = (data.positions ?? data.experience ?? []).map((item) => ({
      title: item.title,
      company: item.companyName ?? item.company ?? "",
      ...(item.startDate !== undefined ? { startDate: String(item.startDate) } : {}),
      ...(item.endDate !== undefined ? { endDate: String(item.endDate) } : {}),
      ...(item.description !== undefined ? { description: item.description } : {}),
      technologies: extractTechnologies(`${item.title} ${item.description ?? ""}`),
    }));

    const summary = data.summary ?? data.about ?? "";
    const fullText = [data.headline, summary, ...experience.map((e) => e.description ?? "")].join(
      " ",
    );

    return {
      name: data.name ?? [data.firstName, data.lastName].filter(Boolean).join(" "),
      headline: data.headline ?? "",
      summary,
      skills: data.skills,
      technologies: extractTechnologies(fullText),
      experience,
      certifications: data.certifications,
      languages: data.languages,
    };
  }
}
