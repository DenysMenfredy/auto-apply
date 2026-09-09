import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { initChatModel } from "langchain/chat_models/universal";
import type { ModelRates } from "../../../domain/agent/budget.js";
import type { ReasoningTier } from "../../../domain/agent/reasoning-tier.js";
import type { PricingTable } from "./pricing.js";
import { type ProviderProfile, profileFor } from "./profiles.js";
import { resolveTier } from "./reasoning-tiers.js";

/** A `provider:model` selector, e.g. `anthropic:claude-opus-5`. */
export interface ModelSelector {
  provider: string;
  model: string;
}

/**
 * Parses `provider:model`, or a bare provider (using its default model).
 * Model ids may themselves contain colons, so only the first is a separator.
 */
export function parseSelector(value: string): ModelSelector {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Empty LLM selector. Use "provider:model", e.g. "anthropic".');

  const separator = trimmed.indexOf(":");
  const provider = separator === -1 ? trimmed : trimmed.slice(0, separator);
  const model = separator === -1 ? "" : trimmed.slice(separator + 1).trim();
  const profile = profileFor(provider);
  return { provider, model: model || profile.defaultModel };
}

export function selectorKey({ provider, model }: ModelSelector): string {
  return `${provider}:${model}`;
}

/**
 * Resolves chat models for a provider (AGENT_PLAN §4.1).
 *
 * `initChatModel` imports the vendor adapter lazily, so selecting DeepSeek
 * never loads the Anthropic SDK. This is the only module in the project that
 * knows a provider by name.
 */
export class ProviderRegistry {
  readonly profile: ProviderProfile;
  private readonly cache = new Map<ReasoningTier, Promise<BaseChatModel>>();

  constructor(
    private readonly selector: ModelSelector,
    private readonly pricing: PricingTable,
  ) {
    this.profile = profileFor(selector.provider);
  }

  get id(): string {
    return selectorKey(this.selector);
  }

  /** Resolves the model for one tier, memoised per tier. */
  model(tier: ReasoningTier): Promise<BaseChatModel> {
    const cached = this.cache.get(tier);
    if (cached) return cached;

    // The invariant that no tier ever sends an unsupported parameter (notably
    // temperature, which Claude Opus 5 rejects with a 400) is asserted across
    // every profile and tier in tests/unit/agent-providers.test.ts, which
    // catches a bad tier mapping at build time rather than mid-run.
    const resolved = resolveTier(this.profile, tier, this.selector.model);

    const promise = initChatModel(resolved.model, {
      modelProvider: this.profile.provider,
      ...resolved.params,
    }) as Promise<BaseChatModel>;
    this.cache.set(tier, promise);
    return promise;
  }

  /** Rates for a tier's model, or null when that model is unpriced. */
  ratesFor(tier: ReasoningTier): ModelRates | null {
    const { model } = resolveTier(this.profile, tier, this.selector.model);
    return this.pricing.rates(selectorKey({ provider: this.profile.provider, model }));
  }

  /** True when the provider's credential is present in the environment. */
  hasCredential(env: NodeJS.ProcessEnv = process.env): boolean {
    return Boolean(env[this.profile.apiKeyEnv]);
  }
}
