import type { MatchEngine } from "../../shared/interfaces/match-engine.js";
import type { CandidateProfile } from "../candidate/candidate-profile.js";
import { seniorityRank } from "../candidate/seniority.js";
import type { Job } from "../job/job.js";
import type { MatchResult } from "./match-result.js";
import { hasCategoryExperience } from "./normalization.js";

/**
 * Keyword-based scoring (RF-009). Weights sum to 100:
 *
 *   Technology overlap ......... 45
 *   Backend experience ......... 10
 *   AI experience .............. 10
 *   Cloud experience ........... 10
 *   Seniority alignment ........ 10
 *   Years of experience ........ 10
 *   Preferred location .........  5
 *
 * Category points (backend/AI/cloud) are only deducted when the job actually
 * asks for that category, so a pure backend role is not penalized for a
 * candidate without ML experience.
 */
export class KeywordMatchEngine implements MatchEngine {
  evaluate(candidate: CandidateProfile, job: Job): Promise<MatchResult> {
    const candidateTech = lowerSet([...candidate.technologies, ...candidate.skills]);
    const jobTech = job.technologies;

    const matchedSkills = jobTech.filter((tech) => candidateTech.has(tech.toLowerCase()));
    const missingSkills = jobTech.filter((tech) => !candidateTech.has(tech.toLowerCase()));

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    let score = 0;

    // Technology overlap: proportional to how many of the job's technologies
    // the candidate covers. Jobs listing no technologies get half credit
    // because there is nothing to disprove compatibility.
    const overlapRatio = jobTech.length === 0 ? 0.5 : matchedSkills.length / jobTech.length;
    score += 45 * overlapRatio;
    if (matchedSkills.length > 0) {
      strengths.push(`Matches ${matchedSkills.length}/${jobTech.length} technologies`);
    }
    if (missingSkills.length > 0) {
      weaknesses.push(`Missing: ${missingSkills.join(", ")}`);
    }

    score += this.categoryPoints(candidate, job, "backend", 10, strengths, weaknesses);
    score += this.categoryPoints(candidate, job, "ai", 10, strengths, weaknesses);
    score += this.categoryPoints(candidate, job, "cloud", 10, strengths, weaknesses);
    score += seniorityPoints(candidate, job, strengths, weaknesses);
    score += yearsPoints(candidate, job, weaknesses);
    score += locationPoints(candidate, job, strengths, weaknesses);

    return Promise.resolve({
      job,
      candidate,
      score: Math.round(Math.min(100, Math.max(0, score))),
      matchedSkills,
      missingSkills,
      strengths,
      weaknesses,
    });
  }

  private categoryPoints(
    candidate: CandidateProfile,
    job: Job,
    category: "backend" | "ai" | "cloud",
    weight: number,
    strengths: string[],
    weaknesses: string[],
  ): number {
    const jobNeeds = hasCategoryExperience(job.technologies, category);
    if (!jobNeeds) return weight; // category not required: no penalty
    const candidateHas = hasCategoryExperience(
      [...candidate.technologies, ...candidate.skills],
      category,
    );
    if (candidateHas) {
      strengths.push(`Relevant ${category} experience`);
      return weight;
    }
    weaknesses.push(`Job requires ${category} experience the profile does not show`);
    return 0;
  }
}

function lowerSet(values: readonly string[]): Set<string> {
  return new Set(values.map((v) => v.toLowerCase()));
}

function seniorityPoints(
  candidate: CandidateProfile,
  job: Job,
  strengths: string[],
  weaknesses: string[],
): number {
  const jobRank = seniorityRank(job.seniority);
  const candidateRank = seniorityRank(candidate.seniority);
  if (jobRank < 0 || candidateRank < 0) return 7; // unknown: mostly benefit of the doubt
  const distance = Math.abs(jobRank - candidateRank);
  if (distance === 0) {
    strengths.push(`Seniority matches (${job.seniority})`);
    return 10;
  }
  if (distance === 1) return 7;
  weaknesses.push(`Seniority gap: job is ${job.seniority}, candidate is ${candidate.seniority}`);
  return Math.max(0, 7 - distance * 3);
}

const MIN_YEARS_PATTERN = /(\d+)\s*\+?\s*years?/i;

function yearsPoints(candidate: CandidateProfile, job: Job, weaknesses: string[]): number {
  const requirementText = job.requirements.join(" ") || job.description;
  const match = requirementText.match(MIN_YEARS_PATTERN);
  if (!match) return 8; // no explicit requirement: near-full credit
  const required = Number(match[1]);
  if (candidate.yearsExperience >= required) return 10;
  weaknesses.push(`Job asks for ${required}+ years, candidate has ${candidate.yearsExperience}`);
  const deficit = required - candidate.yearsExperience;
  return Math.max(0, 10 - deficit * 3);
}

function locationPoints(
  candidate: CandidateProfile,
  job: Job,
  strengths: string[],
  weaknesses: string[],
): number {
  if (candidate.preferredLocations.length === 0) return 5;
  const jobLocation = `${job.location} ${job.remote ? "remote" : ""}`.toLowerCase();
  const matched = candidate.preferredLocations.some((preferred) =>
    jobLocation.includes(preferred.toLowerCase()),
  );
  if (matched) {
    strengths.push(`Location fits (${job.remote ? "Remote" : job.location})`);
    return 5;
  }
  weaknesses.push(`Location ${job.location || "unknown"} outside preferences`);
  return 0;
}
