import { randomUUID } from "node:crypto";
import { normalizeTechnologies } from "../matching/normalization.js";
import type { CandidateProfile, ExperienceEntry } from "./candidate-profile.js";
import { inferSeniority } from "./seniority.js";

/**
 * Merges partial profiles produced by ProfileSources (resume, LinkedIn, ...)
 * into one normalized CandidateProfile.
 *
 * Merge rules:
 * - Scalar fields: first non-empty value wins (source order = priority order).
 * - Skills/technologies/languages/certifications: union, normalized, deduplicated.
 * - Experience: union, deduplicated by company + title.
 * - Years of experience: explicit value wins, otherwise derived from experience dates.
 * - Seniority: inferred from experience titles and years when not explicit.
 */
export class CandidateProfileBuilder {
  private readonly parts: Partial<CandidateProfile>[] = [];

  add(part: Partial<CandidateProfile>): this {
    this.parts.push(part);
    return this;
  }

  build(): CandidateProfile {
    const experience = mergeExperience(this.parts);
    const yearsExperience =
      firstDefined(this.parts, (p) => p.yearsExperience) ?? estimateYears(experience);
    const explicitSeniority = firstDefined(this.parts, (p) =>
      p.seniority && p.seniority !== "unknown" ? p.seniority : undefined,
    );
    const headline = firstNonEmpty(this.parts, (p) => p.headline);

    return {
      id: firstNonEmpty(this.parts, (p) => p.id) || randomUUID(),
      name: firstNonEmpty(this.parts, (p) => p.name),
      headline,
      summary: firstNonEmpty(this.parts, (p) => p.summary),
      skills: mergeLists(this.parts, (p) => p.skills),
      technologies: mergeLists(this.parts, (p) => p.technologies),
      experience,
      education: this.parts.flatMap((p) => p.education ?? []),
      languages: mergeLists(this.parts, (p) => p.languages),
      certifications: mergeLists(this.parts, (p) => p.certifications),
      yearsExperience,
      seniority:
        explicitSeniority ??
        inferSeniority([headline, ...experience.map((e) => e.title)], yearsExperience),
      preferredLocations: mergeLists(this.parts, (p) => p.preferredLocations),
    };
  }
}

function firstNonEmpty(
  parts: readonly Partial<CandidateProfile>[],
  pick: (p: Partial<CandidateProfile>) => string | undefined,
): string {
  for (const part of parts) {
    const value = pick(part)?.trim();
    if (value) return value;
  }
  return "";
}

function firstDefined<T>(
  parts: readonly Partial<CandidateProfile>[],
  pick: (p: Partial<CandidateProfile>) => T | undefined,
): T | undefined {
  for (const part of parts) {
    const value = pick(part);
    if (value !== undefined) return value;
  }
  return undefined;
}

function mergeLists(
  parts: readonly Partial<CandidateProfile>[],
  pick: (p: Partial<CandidateProfile>) => string[] | undefined,
): string[] {
  return normalizeTechnologies(parts.flatMap((p) => pick(p) ?? []));
}

function mergeExperience(parts: readonly Partial<CandidateProfile>[]): ExperienceEntry[] {
  const seen = new Map<string, ExperienceEntry>();
  for (const entry of parts.flatMap((p) => p.experience ?? [])) {
    const key = `${entry.company.toLowerCase().trim()}::${entry.title.toLowerCase().trim()}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...entry, technologies: normalizeTechnologies(entry.technologies) });
      continue;
    }
    // Same role from two sources: keep the richer description and merge stacks.
    seen.set(key, {
      ...existing,
      description:
        (entry.description?.length ?? 0) > (existing.description?.length ?? 0)
          ? entry.description
          : existing.description,
      startDate: existing.startDate ?? entry.startDate,
      endDate: existing.endDate ?? entry.endDate,
      technologies: normalizeTechnologies([...existing.technologies, ...entry.technologies]),
    });
  }
  return [...seen.values()];
}

const YEAR_PATTERN = /\b(19|20)\d{2}\b/;

function yearOf(date: string | undefined): number | undefined {
  if (!date) return undefined;
  if (/present|current|atual/i.test(date)) return new Date().getFullYear();
  const match = date.match(YEAR_PATTERN);
  return match ? Number(match[0]) : undefined;
}

/** Rough span between the earliest start year and the latest end year. */
function estimateYears(experience: readonly ExperienceEntry[]): number {
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  for (const entry of experience) {
    const start = yearOf(entry.startDate);
    const end = yearOf(entry.endDate) ?? (entry.startDate ? new Date().getFullYear() : undefined);
    if (start !== undefined) earliest = Math.min(earliest, start);
    if (end !== undefined) latest = Math.max(latest, end);
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return 0;
  return Math.max(0, latest - earliest);
}
