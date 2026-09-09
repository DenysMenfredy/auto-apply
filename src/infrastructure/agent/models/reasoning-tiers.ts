import type { ReasoningTier } from "../../../domain/agent/reasoning-tier.js";
import type { ProviderProfile } from "./profiles.js";

/** Model id plus the native parameters that express a tier for one provider. */
export interface TierResolution {
  model: string;
  params: Record<string, unknown>;
}

/** Anthropic and OpenAI-style effort names per tier. */
const EFFORT: Readonly<Record<ReasoningTier, string>> = {
  light: "low",
  standard: "medium",
  deep: "high",
};

/**
 * Analytical work wants the deterministic end of the sampling range on
 * providers that still expose one. DeepSeek documents 0.0 for coding/math.
 */
const ANALYTICAL_TEMPERATURE = 0;

/**
 * Maps the portable tier onto whatever the vendor actually exposes
 * (AGENT_PLAN §4.4). This is the only place a provider's native knob is named.
 */
export function resolveTier(
  profile: ProviderProfile,
  tier: ReasoningTier,
  baseModel?: string,
): TierResolution {
  const model = profile.tierModels?.[tier] ?? baseModel ?? profile.defaultModel;
  const params: Record<string, unknown> = {};

  switch (profile.reasoningControl) {
    case "effort":
      params.thinking = { type: "adaptive" };
      params.outputConfig = { effort: EFFORT[tier] };
      break;
    case "reasoning_effort":
      params.reasoning_effort = EFFORT[tier];
      break;
    // "separate_model" is already expressed by the model id above, and "none"
    // degrades to a prompt-level instruction the graph adds instead.
    case "separate_model":
    case "none":
      break;
  }

  if (profile.acceptsTemperature) {
    params.temperature = ANALYTICAL_TEMPERATURE;
  }

  return { model, params };
}

/**
 * True when a run is operating without any reasoning control, so evaluation
 * can annotate the row rather than silently compare unlike configurations.
 */
export function lacksReasoningControl(profile: ProviderProfile): boolean {
  return profile.reasoningControl === "none";
}
