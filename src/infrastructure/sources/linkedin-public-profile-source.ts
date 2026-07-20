import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type {
  CandidateProfile,
  EducationEntry,
  ExperienceEntry,
} from "../../domain/candidate/candidate-profile.js";
import { extractTechnologies } from "../../domain/matching/normalization.js";
import type { HttpClient } from "../../shared/interfaces/http-client.js";
import type { ProfileSource } from "../../shared/interfaces/profile-source.js";

/**
 * Fetches a public LinkedIn profile URL and extracts what LinkedIn exposes to
 * logged-out visitors: the JSON-LD Person document plus the guest-page HTML
 * (experience/education cards, OpenGraph tags).
 *
 * Best effort by nature (RF-003 "Public Profile" support): LinkedIn frequently
 * answers anonymous requests with an authwall. When that happens this source
 * fails with an actionable error suggesting the JSON export flow — it never
 * returns a silently empty profile.
 */
export class LinkedInPublicProfileSource implements ProfileSource {
  readonly name = "linkedin-public-profile";

  constructor(
    private readonly profileUrl: string,
    private readonly http: HttpClient,
  ) {}

  async parse(): Promise<Partial<CandidateProfile>> {
    const url = this.validateUrl();
    const response = await this.http.get(url.toString());

    if (isAuthwalled(response.status, response.body)) {
      throw new Error(
        `LinkedIn blocked anonymous access to ${url} (authwall). Public scraping is unreliable; download your data instead (LinkedIn → Settings → Data privacy → Get a copy of your data) and pass the JSON file to --linkedin.`,
      );
    }
    if (response.status >= 400) {
      throw new Error(`LinkedIn profile fetch failed with HTTP ${response.status} for ${url}.`);
    }

    const profile = parseLinkedInPublicProfile(response.body);
    if (!profile.name && (profile.experience?.length ?? 0) === 0) {
      throw new Error(
        `No profile data found at ${url}. The profile may be private or the page layout changed. Use the LinkedIn JSON export flow instead.`,
      );
    }
    return profile;
  }

  private validateUrl(): URL {
    let url: URL;
    try {
      url = new URL(this.profileUrl);
    } catch {
      throw new Error(`"${this.profileUrl}" is not a valid URL.`);
    }
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) {
      throw new Error(`"${this.profileUrl}" is not a linkedin.com URL.`);
    }
    if (!/^\/in\//.test(url.pathname)) {
      throw new Error(
        `"${this.profileUrl}" does not look like a profile URL (expected linkedin.com/in/<handle>).`,
      );
    }
    return url;
  }
}

function isAuthwalled(status: number, body: string): boolean {
  if (status === 999) return true; // LinkedIn's anti-bot status code
  return /linkedin\.com\/authwall|join linkedin|<title>[^<]*sign\s?(up|in)[^<]*<\/title>/i.test(
    body,
  );
}

export function parseLinkedInPublicProfile(html: string): Partial<CandidateProfile> {
  const $ = cheerio.load(html);
  const person = extractJsonLdPerson($);

  const name = person?.name ?? nameFromOgTitle($);
  const headline = firstString(person?.jobTitle) ?? headlineFromOgTitle($, name);
  const summary =
    person?.description ??
    $('section[data-section="summary"] p, .summary .core-section-container__content p')
      .first()
      .text()
      .trim();

  const experience = extractGuestExperience($);
  const education = extractGuestEducation($, person);
  const languages = (person?.knowsLanguage ?? [])
    .map((lang) => lang.name)
    .filter((n): n is string => Boolean(n));

  const fullText = [
    headline,
    summary,
    ...experience.map((e) => `${e.title} ${e.description ?? ""}`),
  ]
    .filter(Boolean)
    .join(" ");

  const profile: Partial<CandidateProfile> = {
    technologies: extractTechnologies(fullText),
    experience,
    education,
    languages,
  };
  if (name) profile.name = name;
  if (headline) profile.headline = headline;
  if (summary) profile.summary = summary;
  return profile;
}

interface JsonLdPerson {
  name?: string;
  jobTitle?: string | string[];
  description?: string;
  knowsLanguage?: Array<{ name?: string }>;
  alumniOf?: Array<{ "@type"?: string; name?: string }>;
}

function extractJsonLdPerson($: CheerioAPI): JsonLdPerson | null {
  for (const element of $('script[type="application/ld+json"]').toArray()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse($(element).text());
    } catch {
      continue;
    }
    const person = findPerson(parsed);
    if (person) return person;
  }
  return null;
}

function findPerson(node: unknown): JsonLdPerson | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findPerson(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object" || node === null) return null;
  const record = node as Record<string, unknown>;
  if (record["@type"] === "Person") return record as JsonLdPerson;
  if (record["@graph"]) return findPerson(record["@graph"]);
  return null;
}

function firstString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** og:title on guest pages: "Name - Headline | LinkedIn". */
function nameFromOgTitle($: CheerioAPI): string | undefined {
  const og = $('meta[property="og:title"]').attr("content");
  return (
    og
      ?.split(" - ")[0]
      ?.replace(/\|\s*LinkedIn\s*$/i, "")
      .trim() || undefined
  );
}

function headlineFromOgTitle($: CheerioAPI, name: string | undefined): string | undefined {
  const og = $('meta[property="og:title"]').attr("content");
  if (!og) return undefined;
  const withoutSuffix = og.replace(/\s*\|\s*LinkedIn\s*$/i, "");
  const withoutName = name ? withoutSuffix.replace(`${name} - `, "") : withoutSuffix;
  return withoutName.trim() || undefined;
}

/** Experience cards on the logged-out ("guest") profile page. */
function extractGuestExperience($: CheerioAPI): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  $('section[class*="experience"] li, ul.experience__list li').each((_, item) => {
    const card = $(item);
    const title = card.find("h3").first().text().trim();
    const company = card.find("h4").first().text().trim();
    if (!title || !company) return;

    // Prefer <time> elements; the .date-range wrapper concatenates them.
    let dates = card
      .find("time")
      .toArray()
      .map((el) => $(el).text().trim());
    if (dates.length === 0) {
      dates = card
        .find(".date-range")
        .first()
        .text()
        .split(/[-–—]/)
        .map((part) => part.trim())
        .filter(Boolean);
    }
    const description = card
      .find('[class*="show-more-less-text"], p[class*="description"]')
      .first()
      .text()
      .trim();

    const entry: ExperienceEntry = {
      title,
      company,
      technologies: extractTechnologies(`${title} ${description}`),
    };
    if (dates[0]) entry.startDate = dates[0];
    if (dates[1]) entry.endDate = dates[1];
    if (description) entry.description = description;
    entries.push(entry);
  });
  return entries;
}

function extractGuestEducation($: CheerioAPI, person: JsonLdPerson | null): EducationEntry[] {
  const fromHtml: EducationEntry[] = [];
  $('section[class*="education"] li').each((_, item) => {
    const card = $(item);
    const institution = card.find("h3").first().text().trim();
    if (!institution) return;
    const degree = card.find("h4").first().text().trim();
    const entry: EducationEntry = { institution };
    if (degree) entry.degree = degree;
    fromHtml.push(entry);
  });
  if (fromHtml.length > 0) return fromHtml;

  return (person?.alumniOf ?? [])
    .filter((org) => org["@type"] === "EducationalOrganization" && org.name)
    .map((org) => ({ institution: org.name as string }));
}
