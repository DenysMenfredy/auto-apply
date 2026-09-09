import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { ToolDeps } from "./types.js";

const schema = z.object({
  urls: z.array(z.string().min(1)).min(1).describe("Candidate job URLs to test"),
});

export interface CheckSeenArtifact {
  fresh: string[];
  seen: string[];
}

/**
 * Partitions URLs into ones already visited this run and ones still worth
 * fetching, so the agent does not pay to re-walk the same posting. Pure
 * query: it marks nothing, `fetch_job` does the marking.
 */
export function createCheckSeenTool(deps: ToolDeps) {
  return tool(
    (input): [string, CheckSeenArtifact] => {
      const fresh: string[] = [];
      const seen: string[] = [];
      for (const url of input.urls) {
        (deps.state.hasSeen(url) ? seen : fresh).push(url);
      }
      const content = fresh.length
        ? `${fresh.length} new, ${seen.length} already seen.\nNew:\n${fresh.join("\n")}`
        : `All ${seen.length} URLs have already been seen.`;
      return [content, { fresh, seen }];
    },
    {
      name: "check_seen",
      description:
        "Given candidate job URLs, report which have not been visited yet this run. Call before fetching to avoid duplicate work.",
      schema,
      responseFormat: "content_and_artifact",
    },
  );
}
