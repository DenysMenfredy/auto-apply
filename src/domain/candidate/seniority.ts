import type { Seniority } from "../../shared/types/common.js";

const TITLE_PATTERNS: Array<[RegExp, Seniority]> = [
  [/\bintern(ship)?\b/i, "intern"],
  [/\b(junior|jr\.?|entry[- ]level)\b/i, "junior"],
  [/\bprincipal\b/i, "principal"],
  [/\bstaff\b/i, "staff"],
  [/\b(senior|sr\.?|lead)\b/i, "senior"],
  [/\b(mid[- ]level|intermediate|pleno)\b/i, "mid"],
];

/** Infer seniority from a job/role title. Returns "unknown" when no signal exists. */
export function inferSeniorityFromTitle(title: string): Seniority {
  for (const [pattern, seniority] of TITLE_PATTERNS) {
    if (pattern.test(title)) return seniority;
  }
  return "unknown";
}

/** Infer seniority from total years of professional experience. */
export function inferSeniorityFromYears(years: number): Seniority {
  if (years < 0) return "unknown";
  if (years < 1) return "junior";
  if (years < 4) return "mid";
  if (years < 8) return "senior";
  return "staff";
}

/**
 * Combine explicit title signals (strongest) with years of experience.
 * Title keywords win because they encode how the market already labels the person.
 */
export function inferSeniority(titles: readonly string[], years: number): Seniority {
  for (const title of titles) {
    const fromTitle = inferSeniorityFromTitle(title);
    if (fromTitle !== "unknown") return fromTitle;
  }
  if (years > 0) return inferSeniorityFromYears(years);
  return "unknown";
}

const SENIORITY_ORDER: Record<Seniority, number> = {
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  staff: 4,
  principal: 5,
  unknown: -1,
};

/** Numeric rank used to compare candidate and job seniority. -1 means unknown. */
export function seniorityRank(seniority: Seniority): number {
  return SENIORITY_ORDER[seniority];
}
