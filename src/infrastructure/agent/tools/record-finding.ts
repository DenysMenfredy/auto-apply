import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { type ToolDeps, describeFailure } from "./types.js";

const schema = z.object({
  url: z.string().min(1).describe("URL of a job already fetched with fetch_job"),
  score: z.number().int().min(0).max(100).describe("Compatibility score 0-100"),
  note: z.string().max(400).optional().describe("Why this role is worth reporting"),
});

export interface RecordFindingArtifact {
  recorded: boolean;
  total: number;
  reason?: string;
}

/**
 * Promotes a scored job into the run's findings — the agent's only write, and
 * the reason its tool surface can contain no submit or send capability
 * (AGENT_PLAN §1.2). The worst outcome of a successful prompt injection is a
 * wrong entry in this list.
 */
export function createRecordFindingTool(deps: ToolDeps) {
  return tool(
    (input): [string, RecordFindingArtifact] => {
      const job = deps.state.getJob(input.url);
      if (!job) {
        return [
          describeFailure("not-fetched", input.url),
          { recorded: false, total: deps.state.counts.findings, reason: "not fetched" },
        ];
      }

      deps.state.addFinding({
        url: input.url,
        title: job.title,
        company: job.company,
        score: input.score,
        ...(input.note ? { note: input.note } : {}),
      });

      const total = deps.state.counts.findings;
      return [
        `Recorded ${job.title} at ${job.company} (${input.score}). ${total} total.`,
        {
          recorded: true,
          total,
        },
      ];
    },
    {
      name: "record_finding",
      description:
        "Record a job as a finding to report to the user. Only jobs already fetched can be recorded.",
      schema,
      responseFormat: "content_and_artifact",
    },
  );
}
