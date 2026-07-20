import type { JobBoard } from "../../shared/types/common.js";
import type { CandidateProfile } from "../candidate/candidate-profile.js";
import { boardSearchSite } from "../job/boards.js";
import type { SearchQuery } from "./search-query.js";

export interface QueryGeneratorOptions {
  roles: string[];
  locations: string[];
  boards: JobBoard[];
  /** Upper bound on generated queries to keep search volume predictable. */
  maxQueries: number;
}

export const DEFAULT_QUERY_OPTIONS: QueryGeneratorOptions = {
  roles: [
    "Software Engineer",
    "Backend Engineer",
    "AI Engineer",
    "Machine Learning Engineer",
    "Full Stack Engineer",
  ],
  locations: ["Remote", "LATAM", "United States", "Europe"],
  boards: ["ashby", "greenhouse", "lever", "workable", "bamboohr"],
  maxQueries: 25,
};

/**
 * Generates Google Hacking queries (site: operator per board) from the
 * candidate profile and search preferences.
 *
 * Roles the candidate has actually held are prioritized so the query budget
 * is spent on the most promising searches first.
 */
export class SearchQueryGenerator {
  constructor(private readonly options: QueryGeneratorOptions = DEFAULT_QUERY_OPTIONS) {}

  generate(candidate: CandidateProfile): SearchQuery[] {
    const roles = prioritizeRoles(this.options.roles, candidate);
    const locations =
      candidate.preferredLocations.length > 0
        ? candidate.preferredLocations
        : this.options.locations;

    const queries: SearchQuery[] = [];
    // Boards iterate innermost so every role reaches all boards before the
    // query budget runs out.
    outer: for (const location of [locations[0], ...locations.slice(1)]) {
      for (const role of roles) {
        for (const board of this.options.boards) {
          if (queries.length >= this.options.maxQueries) break outer;
          queries.push({
            query: buildQueryString(board, role, location),
            role,
            board,
            ...(location ? { location } : {}),
          });
        }
      }
    }
    return queries;
  }
}

function buildQueryString(board: JobBoard, role: string, location?: string): string {
  const parts = [`site:${boardSearchSite(board)}`, `"${role}"`];
  if (location) parts.push(`"${location}"`);
  return parts.join(" ");
}

/** Roles matching the candidate's headline or strongest technologies come first. */
function prioritizeRoles(roles: readonly string[], candidate: CandidateProfile): string[] {
  const signal = [
    candidate.headline,
    ...candidate.experience.map((e) => e.title),
    ...candidate.technologies,
  ]
    .join(" ")
    .toLowerCase();

  return [...roles].sort((a, b) => roleAffinity(b, signal) - roleAffinity(a, signal));
}

function roleAffinity(role: string, signal: string): number {
  const words = role.toLowerCase().split(/\s+/);
  return words.filter((word) => signal.includes(word)).length / words.length;
}
