import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { categorize } from "../../../domain/matching/match-result.js";
import { type ToolDeps, describeFailure } from "./types.js";

const schema = z.object({
  urls: z.array(z.string().min(1)).min(1).describe("URLs already fetched with fetch_job"),
});

export interface PrefilterEntry {
  url: string;
  score: number;
  category: string;
  matchedSkills: string[];
  missingSkills: string[];
}

export interface PrefilterArtifact {
  scored: PrefilterEntry[];
  missing: string[];
}

/**
 * Deterministic keyword scoring over already-fetched jobs (AGENT_PLAN §3.2).
 *
 * Costs nothing and spends no tokens, which is the entire point: it culls the
 * candidate set before anything reaches an LLM judge.
 */
export function createPrefilterScoreTool(deps: ToolDeps) {
  return tool(
    async (input): Promise<[string, PrefilterArtifact]> => {
      const scored: PrefilterEntry[] = [];
      const missing: string[] = [];

      for (const url of input.urls) {
        const job = deps.state.getJob(url);
        if (!job) {
          missing.push(url);
          continue;
        }
        const result = await deps.matchEngine.evaluate(deps.candidate, job);
        scored.push({
          url,
          score: result.score,
          category: categorize(result.score),
          matchedSkills: result.matchedSkills,
          missingSkills: result.missingSkills,
        });
      }

      scored.sort((a, b) => b.score - a.score);
      const lines = scored.map((e) => `${String(e.score).padStart(3)}  ${e.category}  ${e.url}`);
      if (missing.length) {
        lines.push(describeFailure("not-fetched", `${missing.length} URL(s)`));
      }
      return [lines.join("\n") || "Nothing to score.", { scored, missing }];
    },
    {
      name: "prefilter_score",
      description:
        "Score already-fetched jobs against the candidate profile using deterministic keyword matching. Free and instant — use it to rank before spending deeper analysis.",
      schema,
      responseFormat: "content_and_artifact",
    },
  );
}
