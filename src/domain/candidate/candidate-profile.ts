import type { Seniority } from "../../shared/types/common.js";

export interface ExperienceEntry {
  title: string;
  company: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  technologies: string[];
}

export interface EducationEntry {
  institution: string;
  degree?: string;
  field?: string;
  startYear?: number;
  endYear?: number;
}

export interface CandidateProfile {
  id: string;
  name: string;
  headline: string;
  summary: string;
  skills: string[];
  technologies: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  languages: string[];
  certifications: string[];
  yearsExperience: number;
  seniority: Seniority;
  preferredLocations: string[];
}
