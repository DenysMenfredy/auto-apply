import type { Job } from "../job/job.js";
import type { QueryOutcome } from "../search/strategy.js";

/** A job the agent has decided is worth reporting. */
export interface Finding {
  url: string;
  title: string;
  company: string;
  score: number;
  note?: string;
}

/**
 * Normalizes a URL for deduplication: query strings and fragments are
 * tracking noise, and a trailing slash is not a different posting.
 */
export function dedupeKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Mutable bookkeeping for one discovery run (AGENT_PLAN §3.2).
 *
 * Holds parsed jobs so their full text never has to travel through the model
 * to be scored: tools exchange URLs, and the payload stays here.
 */
export class DiscoveryRunState {
  private readonly seen = new Set<string>();
  private readonly jobs = new Map<string, Job>();
  private readonly found = new Map<string, Finding>();
  private readonly outcomes: QueryOutcome[] = [];

  /** Marks a URL visited; false when it had already been seen. */
  markSeen(url: string): boolean {
    const key = dedupeKey(url);
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }

  hasSeen(url: string): boolean {
    return this.seen.has(dedupeKey(url));
  }

  putJob(url: string, job: Job): void {
    this.jobs.set(dedupeKey(url), job);
  }

  getJob(url: string): Job | undefined {
    return this.jobs.get(dedupeKey(url));
  }

  /** Records a finding; recording the same URL twice updates it in place. */
  addFinding(finding: Finding): void {
    this.found.set(dedupeKey(finding.url), finding);
  }

  recordOutcome(outcome: QueryOutcome): void {
    this.outcomes.push(outcome);
  }

  get findings(): readonly Finding[] {
    return [...this.found.values()].sort((a, b) => b.score - a.score);
  }

  get history(): readonly QueryOutcome[] {
    return this.outcomes;
  }

  get counts(): { seen: number; jobs: number; findings: number; queries: number } {
    return {
      seen: this.seen.size,
      jobs: this.jobs.size,
      findings: this.found.size,
      queries: this.outcomes.length,
    };
  }
}
