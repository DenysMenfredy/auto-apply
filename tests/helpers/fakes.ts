import type { CandidateProfile } from "@domain/candidate/candidate-profile.js";
import type { Job } from "@domain/job/job.js";
import type { CacheProvider } from "@shared/interfaces/cache-provider.js";
import type { HttpClient, HttpResponse } from "@shared/interfaces/http-client.js";
import type { Logger } from "@shared/interfaces/logger.js";

export class FakeHttpClient implements HttpClient {
  readonly requests: string[] = [];

  constructor(private readonly responses: Record<string, string | HttpResponse>) {}

  get(url: string): Promise<HttpResponse> {
    this.requests.push(url);
    const match = Object.entries(this.responses).find(([prefix]) => url.startsWith(prefix));
    if (!match) return Promise.resolve({ status: 404, body: "not found" });
    const [, response] = match;
    return Promise.resolve(
      typeof response === "string" ? { status: 200, body: response } : response,
    );
  }
}

export class MemoryCache implements CacheProvider {
  private readonly store = new Map<string, { expiresAt: number; value: unknown }>();

  get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) return Promise.resolve(null);
    return Promise.resolve(entry.value as T);
  }

  set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.store.set(key, { expiresAt: Date.now() + ttlMs, value });
    return Promise.resolve();
  }
}

export const nullLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export function makeCandidate(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    id: "candidate-1",
    name: "Jane Doe",
    headline: "Senior Backend Engineer",
    summary: "Backend engineer focused on Node.js and AI systems.",
    skills: ["Node.js", "TypeScript", "AWS"],
    technologies: ["Node.js", "TypeScript", "AWS", "PostgreSQL", "LLM"],
    experience: [],
    education: [],
    languages: ["English"],
    certifications: [],
    yearsExperience: 7,
    seniority: "senior",
    preferredLocations: ["Remote"],
    ...overrides,
  };
}

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    title: "Senior Backend Engineer",
    company: "Acme",
    description: "Build APIs with Node.js and TypeScript on AWS.",
    requirements: ["5+ years of backend experience"],
    responsibilities: ["Design services"],
    technologies: ["Node.js", "TypeScript", "AWS"],
    location: "Remote",
    remote: true,
    employmentType: "full-time",
    seniority: "senior",
    board: "lever",
    url: "https://jobs.lever.co/acme/1111aaaa-2222-bbbb-3333-cccc4444dddd",
    ...overrides,
  };
}
