import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { inferSeniorityFromTitle } from "../../domain/candidate/seniority.js";
import type { EmploymentType, Job, Salary } from "../../domain/job/job.js";
import { extractTechnologies } from "../../domain/matching/normalization.js";
import type { HttpClient } from "../../shared/interfaces/http-client.js";
import type { JobBoard } from "../../shared/types/common.js";

/**
 * Extraction helpers shared by every board parser. Board parsers provide the
 * board-specific selectors; everything derivable from text (technologies,
 * salary, seniority, remote, sections) lives here so it is never duplicated.
 */

export async function fetchPage(http: HttpClient, url: URL): Promise<string> {
  const response = await http.get(url.toString());
  if (response.status === 404) {
    throw new Error(`Job posting no longer exists (404): ${url}`);
  }
  if (response.status >= 400) {
    throw new Error(`Failed to fetch job page (HTTP ${response.status}): ${url}`);
  }
  return response.body;
}

export interface JsonLdJobPosting {
  title?: string;
  company?: string;
  descriptionHtml?: string;
  location?: string;
  employmentType?: string;
  salary?: Salary;
}

/** schema.org JobPosting metadata, the most reliable data on modern boards. */
export function extractJsonLdJobPosting($: CheerioAPI): JsonLdJobPosting | null {
  for (const element of $('script[type="application/ld+json"]').toArray()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse($(element).text());
    } catch {
      continue;
    }
    const posting = findJobPosting(parsed);
    if (posting) return normalizeJobPosting(posting);
  }
  return null;
}

type JsonLdNode = Record<string, unknown>;

function findJobPosting(node: unknown): JsonLdNode | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object" || node === null) return null;
  const record = node as JsonLdNode;
  if (record["@type"] === "JobPosting") return record;
  if (record["@graph"]) return findJobPosting(record["@graph"]);
  return null;
}

function normalizeJobPosting(posting: JsonLdNode): JsonLdJobPosting {
  const result: JsonLdJobPosting = {};
  if (typeof posting.title === "string") result.title = posting.title;
  const org = posting.hiringOrganization;
  if (typeof org === "object" && org !== null && typeof (org as JsonLdNode).name === "string") {
    result.company = (org as JsonLdNode).name as string;
  }
  if (typeof posting.description === "string") result.descriptionHtml = posting.description;
  const location = jsonLdLocation(posting.jobLocation);
  if (location) result.location = location;
  if (typeof posting.employmentType === "string") result.employmentType = posting.employmentType;
  if (Array.isArray(posting.employmentType) && typeof posting.employmentType[0] === "string") {
    result.employmentType = posting.employmentType[0];
  }
  const salary = jsonLdSalary(posting.baseSalary);
  if (salary) result.salary = salary;
  if (
    typeof posting.jobLocationType === "string" &&
    /telecommute|remote/i.test(posting.jobLocationType)
  ) {
    result.location = result.location ? `${result.location} (Remote)` : "Remote";
  }
  return result;
}

function jsonLdLocation(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "object" || first === null) return undefined;
  const address = (first as JsonLdNode).address;
  if (typeof address === "string") return address;
  if (typeof address === "object" && address !== null) {
    const a = address as JsonLdNode;
    const parts = [a.addressLocality, a.addressRegion, a.addressCountry]
      .filter((p): p is string => typeof p === "string" && p.length > 0)
      .map((p) => p.trim());
    if (parts.length > 0) return parts.join(", ");
  }
  return undefined;
}

function jsonLdSalary(value: unknown): Salary | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const base = value as JsonLdNode;
  const inner =
    typeof base.value === "object" && base.value !== null ? (base.value as JsonLdNode) : base;
  const min = Number(inner.minValue ?? inner.value);
  const max = Number(inner.maxValue ?? inner.value);
  if (!Number.isFinite(min) && !Number.isFinite(max)) return undefined;
  const salary: Salary = { raw: `${inner.minValue ?? ""}-${inner.maxValue ?? ""}` };
  if (Number.isFinite(min)) salary.min = min;
  if (Number.isFinite(max)) salary.max = max;
  if (typeof base.currency === "string") salary.currency = base.currency;
  return salary;
}

/** Convert HTML (page section or JSON-LD description) to readable plain text. */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  $("li").each((_, li) => {
    $(li).prepend("\n- ");
  });
  $("p, div, br, h1, h2, h3, h4").each((_, el) => {
    $(el).prepend("\n");
  });
  return $.root()
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Pull the bullet list that follows a heading matching `headingPattern`
 * (e.g. Requirements / Qualifications) from plain text produced by htmlToText.
 */
export function extractSection(text: string, headingPattern: RegExp): string[] {
  const lines = text.split("\n").map((line) => line.trim());
  const items: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (headingPattern.test(line) && line.length < 80) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (line.startsWith("- ")) {
      items.push(line.slice(2).trim());
      continue;
    }
    // A non-bullet, heading-sized line ends the section.
    if (items.length > 0 && line.length > 0 && line.length < 80 && !line.startsWith("- ")) break;
  }
  return items;
}

export const REQUIREMENTS_HEADING =
  /requirements?|qualifications?|what (you('|’)?ll|we('|’)re looking for)|must have|about you/i;
export const RESPONSIBILITIES_HEADING =
  /responsibilit|what you('|’)?ll (do|be doing)|the role|your (role|mission)|day[- ]to[- ]day/i;

const SALARY_PATTERN =
  /(?:USD|US\$|\$|€|£)\s?(\d{2,3}(?:[,.]\d{3})+|\d{2,3}k)(?:\s*[-–—]\s*(?:USD|US\$|\$|€|£)?\s?(\d{2,3}(?:[,.]\d{3})+|\d{2,3}k))?/i;

export function extractSalary(text: string): Salary | undefined {
  const match = text.match(SALARY_PATTERN);
  if (!match) return undefined;
  const salary: Salary = { raw: match[0].trim() };
  const min = parseAmount(match[1]);
  const max = parseAmount(match[2]);
  if (min !== undefined) salary.min = min;
  if (max !== undefined) salary.max = max;
  if (/€/.test(match[0])) salary.currency = "EUR";
  else if (/£/.test(match[0])) salary.currency = "GBP";
  else salary.currency = "USD";
  return salary;
}

function parseAmount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  if (/k$/i.test(raw)) return Number(raw.slice(0, -1)) * 1000;
  const value = Number(raw.replace(/[,.]/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

export function detectEmploymentType(text: string): EmploymentType {
  // JSON-LD uses FULL_TIME/PART_TIME; prose uses "full-time"/"full time".
  if (/full[-_ ]?time/i.test(text)) return "full-time";
  if (/part[-_ ]?time/i.test(text)) return "part-time";
  if (/contract(or)?\b/i.test(text)) return "contract";
  if (/intern(ship)?\b/i.test(text)) return "internship";
  return "unknown";
}

export function detectRemote(location: string, text: string): boolean {
  if (/remote/i.test(location)) return true;
  return /\b(fully|100%)\s+remote\b|\bremote[- ](first|friendly)\b/i.test(text);
}

export function jobIdFromUrl(url: URL): string {
  return createHash("sha256").update(url.toString()).digest("hex").slice(0, 16);
}

export interface JobDraft {
  title: string;
  company: string;
  description: string;
  location: string;
  employmentType?: string;
}

/** Assemble the final Job from board-extracted fields plus shared derivations. */
export function finalizeJob(board: JobBoard, url: URL, draft: JobDraft): Job {
  const { title, company, description, location } = draft;
  if (!title) {
    throw new Error(`Could not extract a job title from ${url} — page layout may have changed.`);
  }
  const fullText = `${title}\n${description}`;
  const salary = extractSalary(fullText);
  return {
    id: jobIdFromUrl(url),
    title: title.trim(),
    company: company.trim(),
    description: description.trim(),
    requirements: extractSection(description, REQUIREMENTS_HEADING),
    responsibilities: extractSection(description, RESPONSIBILITIES_HEADING),
    technologies: extractTechnologies(fullText),
    location: location.trim(),
    remote: detectRemote(location, fullText),
    ...(salary ? { salary } : {}),
    employmentType: detectEmploymentType(draft.employmentType ?? fullText),
    seniority: inferSeniorityFromTitle(title),
    board,
    url: url.toString(),
  };
}
