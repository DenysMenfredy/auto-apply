/**
 * Portable reasoning effort (AGENT_PLAN §4.4).
 *
 * Effort control is the least portable thing across vendors: Anthropic exposes
 * `outputConfig.effort`, OpenAI-style APIs use `reasoning_effort`, and DeepSeek
 * switches to a different model id entirely. Graph nodes therefore request an
 * abstract tier and the provider adapter maps it to whatever that vendor has.
 */
export const REASONING_TIERS = ["light", "standard", "deep"] as const;

export type ReasoningTier = (typeof REASONING_TIERS)[number];

/** Nodes of the discovery graph that call a model. */
export const AGENT_NODES = ["plan", "reflect", "judge", "extract"] as const;

export type AgentNode = (typeof AGENT_NODES)[number];

/**
 * Default tier per node. Strategy quality drives the whole run's recall, so
 * planning gets the deepest tier; extraction is mechanical transcription.
 */
export const NODE_TIERS: Readonly<Record<AgentNode, ReasoningTier>> = {
  plan: "deep",
  reflect: "deep",
  judge: "standard",
  extract: "light",
};
