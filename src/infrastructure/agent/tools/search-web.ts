import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { SearchResult } from "../../../domain/search/search-query.js";
import { JOB_BOARDS } from "../../../shared/types/common.js";
import { type ToolDeps, describeFailure } from "./types.js";

const schema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Full query with Google Hacking operators, e.g. site:jobs.lever.co "AI Engineer"'),
  role: z.string().min(1).describe("Role title this query targets"),
  board: z.enum(JOB_BOARDS).describe("Job board the site: operator targets"),
  location: z.string().optional().describe("Location term this query targets, if any"),
});

export interface SearchWebArtifact {
  results: SearchResult[];
  blocked: boolean;
  reason?: string;
}

/**
 * Runs one search query through the configured `SearchProvider`
 * (AGENT_PLAN §3.2). Swapping `--provider` changes what the agent searches
 * with and the agent never knows; caching and politeness delays are inherited.
 */
export function createSearchWebTool(deps: ToolDeps) {
  return tool(
    async (input): Promise<[string, SearchWebArtifact]> => {
      try {
        const results = await deps.searchProvider.search({
          query: input.query,
          role: input.role,
          board: input.board,
          ...(input.location ? { location: input.location } : {}),
        });

        const content = results.length
          ? results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n")
          : "No results.";
        return [content, { results, blocked: false }];
      } catch (error) {
        // A CAPTCHA or rate limit is an expected condition the agent should
        // route around, not an exception that aborts the run.
        const reason = error instanceof Error ? error.message : String(error);
        deps.logger.warn("search_web failed", { query: input.query, error: reason });
        return [describeFailure("blocked", reason), { results: [], blocked: true, reason }];
      }
    },
    {
      name: "search_web",
      description:
        "Run one web search query and return the result titles and URLs. Use Google Hacking operators (site:, intitle:, inurl:, quoted phrases, OR groups, negation with -).",
      schema,
      responseFormat: "content_and_artifact",
    },
  );
}
