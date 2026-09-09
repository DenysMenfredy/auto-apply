import { createCheckSeenTool } from "./check-seen.js";
import { createFetchJobTool } from "./fetch-job.js";
import { createPrefilterScoreTool } from "./prefilter-score.js";
import { createRecordFindingTool } from "./record-finding.js";
import { createSearchWebTool } from "./search-web.js";
import type { ToolDeps } from "./types.js";

export type { ToolDeps, ToolFailure } from "./types.js";

/**
 * The agent's complete tool surface (AGENT_PLAN §3.2).
 *
 * Every entry wraps a component the deterministic pipeline already uses, so
 * the agent inherits caching, politeness delays, CAPTCHA handling and board
 * routing rather than reimplementing them. Nothing here submits an
 * application, and no tool calls a model.
 */
export function createAgentTools(deps: ToolDeps) {
  return [
    createSearchWebTool(deps),
    createCheckSeenTool(deps),
    createFetchJobTool(deps),
    createPrefilterScoreTool(deps),
    createRecordFindingTool(deps),
  ];
}

export {
  createSearchWebTool,
  createCheckSeenTool,
  createFetchJobTool,
  createPrefilterScoreTool,
  createRecordFindingTool,
};
