import type {
  CandidateProfile,
  EducationEntry,
  ExperienceEntry,
} from "../../domain/candidate/candidate-profile.js";
import { inferSeniority } from "../../domain/candidate/seniority.js";
import { extractTechnologies, normalizeTechnologies } from "../../domain/matching/normalization.js";

/**
 * Heuristic resume text parsing (RF-002), separated from PDF extraction so
 * the logic is testable without binary fixtures.
 *
 * Resumes are unstructured; the strategy is section-based: split the text on
 * well-known headings (Summary, Experience, Skills, ...) and parse each
 * section with the loosest rule that works.
 */

const SECTION_HEADINGS: Record<string, RegExp> = {
  summary: /^(summary|about( me)?|profile|professional summary|objective)$/i,
  experience: /^((work|professional) )?experience|employment( history)?$/i,
  skills: /^(technical )?skills( & tools)?|technologies|tech stack$/i,
  education: /^education( & training)?|academic background$/i,
  certifications: /^certification(s)?|licenses( & certifications)?$/i,
  languages: /^languages?$/i,
};

type Sections = Record<string, string[]>;

export function parseResumeText(text: string): Partial<CandidateProfile> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const sections = splitSections(lines);
  const experience = parseExperience(sections.experience ?? []);
  const yearsExperience = estimateYearsFromText(text);
  const headline = lines[1] && lines[1].length < 90 ? lines[1] : "";

  const profile: Partial<CandidateProfile> = {
    name: lines[0] ?? "",
    headline,
    summary: (sections.summary ?? []).join(" "),
    skills: parseDelimitedList(sections.skills ?? []),
    technologies: extractTechnologies(text),
    experience,
    education: parseEducation(sections.education ?? []),
    certifications: sections.certifications ?? [],
    languages: parseDelimitedList(sections.languages ?? []),
    seniority: inferSeniority([headline, ...experience.map((e) => e.title)], yearsExperience),
  };
  if (yearsExperience > 0) profile.yearsExperience = yearsExperience;
  return profile;
}

function splitSections(lines: readonly string[]): Sections {
  const sections: Sections = {};
  let current: string | null = null;

  for (const line of lines) {
    const heading = matchHeading(line);
    if (heading) {
      current = heading;
      sections[current] ??= [];
      continue;
    }
    if (current) sections[current]?.push(line);
  }
  return sections;
}

function matchHeading(line: string): string | null {
  if (line.length > 40) return null; // headings are short
  const normalized = line.replace(/[:\s]+$/, "");
  for (const [name, pattern] of Object.entries(SECTION_HEADINGS)) {
    if (pattern.test(normalized)) return name;
  }
  return null;
}

function parseDelimitedList(lines: readonly string[]): string[] {
  return normalizeTechnologies(
    lines.flatMap((line) => line.split(/[,•|;·]/)).map((item) => item.replace(/^[-–*]\s*/, "")),
  );
}

const DATE_RANGE =
  /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?((?:19|20)\d{2})\s*[-–—to]+\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?((?:19|20)\d{2}|present|current)/i;

function parseExperience(lines: readonly string[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  let current: ExperienceEntry | null = null;

  for (const line of lines) {
    const dates = line.match(DATE_RANGE);
    // A line that mentions a date range starts a new entry. Formats vary
    // ("Title — Company (2020 - 2023)", "Company | Title | 2020-Present"),
    // so the non-date part is split on common separators.
    if (dates) {
      if (current) entries.push(current);
      const label = line.replace(DATE_RANGE, "").trim();
      const [first = "", second = ""] = label
        .split(/\s*[|@•·—–]\s*|\s+at\s+/i)
        .map((part) => part.replace(/[,()]+/g, " ").trim())
        .filter(Boolean);
      current = {
        title: first,
        company: second,
        startDate: dates[2] ?? "",
        endDate: dates[4] ?? "",
        description: "",
        technologies: [],
      };
      continue;
    }
    if (current) {
      current.description = [current.description, line].filter(Boolean).join(" ");
    }
  }
  if (current) entries.push(current);

  for (const entry of entries) {
    entry.technologies = extractTechnologies(`${entry.title} ${entry.description ?? ""}`);
  }
  return entries;
}

function parseEducation(lines: readonly string[]): EducationEntry[] {
  return lines
    .filter((line) => line.length > 3)
    .map((line) => {
      const years = line.match(/((?:19|20)\d{2}).*?((?:19|20)\d{2})/);
      const entry: EducationEntry = { institution: line.replace(DATE_RANGE, "").trim() };
      if (years) {
        entry.startYear = Number(years[1]);
        entry.endYear = Number(years[2]);
      }
      return entry;
    });
}

/** Prefer an explicit "N years of experience" claim; fall back to date span. */
function estimateYearsFromText(text: string): number {
  const explicit = text.match(/(\d+)\+?\s*years?\s+(?:of\s+)?experience/i);
  if (explicit) return Number(explicit[1]);

  const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  if (years.length < 2) return 0;
  const now = new Date().getFullYear();
  const plausible = years.filter((y) => y >= 1980 && y <= now);
  if (plausible.length < 2) return 0;
  return Math.max(0, Math.min(now, Math.max(...plausible)) - Math.min(...plausible));
}
