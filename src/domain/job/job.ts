import type { JobBoard, Seniority } from "../../shared/types/common.js";

export interface Salary {
  min?: number;
  max?: number;
  currency?: string;
  raw: string;
}

export type EmploymentType = "full-time" | "part-time" | "contract" | "internship" | "unknown";

export interface Job {
  id: string;
  title: string;
  company: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  technologies: string[];
  location: string;
  remote: boolean;
  salary?: Salary;
  employmentType: EmploymentType;
  seniority: Seniority;
  board: JobBoard;
  url: string;
}
