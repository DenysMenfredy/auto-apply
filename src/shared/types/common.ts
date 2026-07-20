export const SENIORITY_LEVELS = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "unknown",
] as const;

export type Seniority = (typeof SENIORITY_LEVELS)[number];

export const JOB_BOARDS = ["ashby", "greenhouse", "lever", "workable", "bamboohr"] as const;

export type JobBoard = (typeof JOB_BOARDS)[number];

export const EXPORT_FORMATS = ["json", "csv", "markdown"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];
