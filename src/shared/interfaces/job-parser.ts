import type { Job } from "../../domain/job/job.js";
import type { JobBoard } from "../types/common.js";

/** Parses job postings from one specific job board. */
export interface JobParser {
  readonly board: JobBoard;
  supports(url: URL): boolean;
  parse(url: URL): Promise<Job>;
}
