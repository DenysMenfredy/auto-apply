import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { detectBoard } from "../../../domain/job/boards.js";
import type { Job } from "../../../domain/job/job.js";
import { type ToolDeps, type ToolFailure, describeFailure } from "./types.js";

const schema = z.object({
  url: z.string().url().describe("Job posting URL on a supported board"),
});

export interface FetchJobArtifact {
  parsed: boolean;
  job?: Job;
  failure?: ToolFailure;
  reason?: string;
}

/**
 * Fetches and parses one posting through the board-routed `JobParser` chain
 * (JSON-LD first, CSS fallback). The parsed job is kept in run state so its
 * full description never travels through the model to be scored.
 */
export function createFetchJobTool(deps: ToolDeps) {
  return tool(
    async (input): Promise<[string, FetchJobArtifact]> => {
      let url: URL;
      try {
        url = new URL(input.url);
      } catch {
        return [
          describeFailure("unsupported", input.url),
          { parsed: false, failure: "unsupported", reason: "not a valid URL" },
        ];
      }

      const board = detectBoard(url);
      const parser = board ? deps.parsers.find((p) => p.board === board && p.supports(url)) : null;
      if (!parser) {
        deps.state.markSeen(input.url);
        return [
          describeFailure("unsupported", input.url),
          { parsed: false, failure: "unsupported", reason: "no parser for this board" },
        ];
      }

      // Marked before parsing: a page that fails to parse should not be
      // retried on the next turn either.
      deps.state.markSeen(input.url);

      try {
        const job = await parser.parse(url);
        deps.state.putJob(input.url, job);
        const summary = [
          `${job.title} — ${job.company}`,
          `${job.remote ? "Remote" : job.location || "Location unknown"} · ${job.seniority} · ${job.board}`,
          job.technologies.length ? `Tech: ${job.technologies.join(", ")}` : "Tech: unlisted",
        ].join("\n");
        return [summary, { parsed: true, job }];
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        deps.logger.warn("fetch_job failed", { url: input.url, error: reason });
        return [
          describeFailure("unparseable", input.url),
          { parsed: false, failure: "unparseable", reason },
        ];
      }
    },
    {
      name: "fetch_job",
      description:
        "Fetch and parse one job posting URL. Returns a short summary; the full description is retained internally for scoring.",
      schema,
      responseFormat: "content_and_artifact",
    },
  );
}
