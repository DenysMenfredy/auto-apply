import type { JobBoard } from "../../shared/types/common.js";

interface BoardRule {
  board: JobBoard;
  /** Hostname (exact or suffix when prefixed with ".") the board serves jobs from. */
  hosts: string[];
  /** Google Hacking site: operator target used to discover jobs on this board. */
  searchSite: string;
  /** Job detail pages must match at least one of these path patterns. */
  jobPathPatterns: RegExp[];
}

const BOARD_RULES: BoardRule[] = [
  {
    board: "ashby",
    hosts: ["jobs.ashbyhq.com"],
    searchSite: "jobs.ashbyhq.com",
    jobPathPatterns: [/^\/[^/]+\/[0-9a-f-]{16,}/i],
  },
  {
    board: "greenhouse",
    hosts: ["boards.greenhouse.io", "job-boards.greenhouse.io"],
    searchSite: "boards.greenhouse.io",
    jobPathPatterns: [/^\/[^/]+\/jobs\/\d+/i, /^\/embed\/job_app/i],
  },
  {
    board: "lever",
    hosts: ["jobs.lever.co"],
    searchSite: "jobs.lever.co",
    jobPathPatterns: [/^\/[^/]+\/[0-9a-f-]{16,}/i],
  },
  {
    board: "workable",
    hosts: ["jobs.workable.com", "apply.workable.com"],
    searchSite: "apply.workable.com",
    jobPathPatterns: [/^\/view\//i, /^\/[^/]+\/j\//i],
  },
  {
    board: "bamboohr",
    hosts: [".bamboohr.com"],
    searchSite: "bamboohr.com",
    jobPathPatterns: [/^\/careers\/\d+/i, /^\/jobs\/view/i],
  },
];

function hostMatches(hostname: string, rule: BoardRule): boolean {
  return rule.hosts.some((host) =>
    host.startsWith(".") ? hostname.endsWith(host) : hostname === host,
  );
}

/** Identify which supported job board serves the given URL, if any. */
export function detectBoard(url: URL): JobBoard | null {
  const rule = BOARD_RULES.find((r) => hostMatches(url.hostname.toLowerCase(), r));
  return rule?.board ?? null;
}

/** True when the URL points at an individual job posting (not a board index). */
export function isJobPostingUrl(url: URL): boolean {
  const rule = BOARD_RULES.find((r) => hostMatches(url.hostname.toLowerCase(), r));
  if (!rule) return false;
  return rule.jobPathPatterns.some((pattern) => pattern.test(url.pathname));
}

/** site: operator target for a board, used by the search query generator. */
export function boardSearchSite(board: JobBoard): string {
  const rule = BOARD_RULES.find((r) => r.board === board);
  if (!rule) throw new Error(`Unsupported job board: ${board}`);
  return rule.searchSite;
}
