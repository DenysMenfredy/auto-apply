import type { ReasoningTier } from "../../../domain/agent/reasoning-tier.js";

/** How a provider reuses a repeated prompt prefix (AGENT_PLAN §4.6). */
export type PromptCaching = "explicit" | "automatic" | "none";

/** How a provider exposes reasoning depth (§4.4). */
export type ReasoningControl = "effort" | "reasoning_effort" | "separate_model" | "none";

/**
 * Capability descriptor extending LangChain's `ModelProfile` with the four
 * things it does not model but this project depends on (AGENT_PLAN §4.3).
 *
 * Graph nodes read capabilities from here and must never branch on a provider
 * name; adding a vendor is one entry in this table.
 */
export interface ProviderProfile {
  provider: string;
  /** Model used for the light and standard tiers. */
  defaultModel: string;
  promptCaching: PromptCaching;
  reasoningControl: ReasoningControl;
  /** False where the API rejects `temperature` outright (Claude Opus 5). */
  acceptsTemperature: boolean;
  /** True where the provider offers native JSON-schema structured output. */
  structuredOutput: boolean;
  toolCalling: boolean;
  maxInputTokens: number;
  /** Env var holding this provider's credential. */
  apiKeyEnv: string;
  /** Model id per tier, for providers that switch models instead of params. */
  tierModels?: Partial<Record<ReasoningTier, string>>;
}

export const PROVIDER_PROFILES: Readonly<Record<string, ProviderProfile>> = {
  anthropic: {
    provider: "anthropic",
    defaultModel: "claude-opus-5",
    promptCaching: "explicit",
    reasoningControl: "effort",
    // `temperature` was removed on Claude Opus 5 and returns a 400.
    acceptsTemperature: false,
    structuredOutput: true,
    toolCalling: true,
    maxInputTokens: 1_000_000,
    apiKeyEnv: "ANTHROPIC_API_KEY",
  },
  deepseek: {
    provider: "deepseek",
    defaultModel: "deepseek-v4-flash",
    promptCaching: "automatic",
    // No effort parameter: depth comes from picking the larger model.
    reasoningControl: "separate_model",
    acceptsTemperature: true,
    structuredOutput: true,
    toolCalling: true,
    maxInputTokens: 1_000_000,
    apiKeyEnv: "DEEPSEEK_API_KEY",
    tierModels: { deep: "deepseek-v4-pro" },
  },
};

export function profileFor(provider: string): ProviderProfile {
  const profile = PROVIDER_PROFILES[provider];
  if (!profile) {
    throw new Error(
      `Unknown LLM provider "${provider}". Supported: ${Object.keys(PROVIDER_PROFILES).join(", ")}.`,
    );
  }
  return profile;
}
