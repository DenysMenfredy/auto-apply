import { REASONING_TIERS } from "@domain/agent/reasoning-tier.js";
import {
  PricingTable,
  STALE_AFTER_DAYS,
  loadPricing,
} from "@infrastructure/agent/models/pricing.js";
import { PROVIDER_PROFILES, profileFor } from "@infrastructure/agent/models/profiles.js";
import {
  lacksReasoningControl,
  resolveTier,
} from "@infrastructure/agent/models/reasoning-tiers.js";
import {
  ProviderRegistry,
  parseSelector,
  selectorKey,
} from "@infrastructure/agent/models/registry.js";
import { describe, expect, it, vi } from "vitest";

describe("provider profiles", () => {
  it("exposes anthropic and deepseek with distinct capabilities", () => {
    expect(Object.keys(PROVIDER_PROFILES).sort()).toEqual(["anthropic", "deepseek"]);
    expect(profileFor("anthropic").promptCaching).toBe("explicit");
    expect(profileFor("deepseek").promptCaching).toBe("automatic");
  });

  it("records that Claude Opus 5 rejects temperature", () => {
    expect(profileFor("anthropic").acceptsTemperature).toBe(false);
    expect(profileFor("deepseek").acceptsTemperature).toBe(true);
  });

  it("fails actionably on an unknown provider", () => {
    expect(() => profileFor("bard")).toThrow(/Supported: anthropic, deepseek/);
  });
});

describe("resolveTier (§4.4)", () => {
  it("maps tiers to effort on a provider with an effort knob, and never sends temperature", () => {
    const deep = resolveTier(profileFor("anthropic"), "deep");
    expect(deep.model).toBe("claude-opus-5");
    expect(deep.params.outputConfig).toEqual({ effort: "high" });
    expect(deep.params.thinking).toEqual({ type: "adaptive" });
    expect(deep.params).not.toHaveProperty("temperature");

    expect(resolveTier(profileFor("anthropic"), "light").params.outputConfig).toEqual({
      effort: "low",
    });
  });

  it("maps the deep tier to a different model where that is the only control", () => {
    const profile = profileFor("deepseek");
    expect(resolveTier(profile, "light").model).toBe("deepseek-v4-flash");
    expect(resolveTier(profile, "standard").model).toBe("deepseek-v4-flash");
    expect(resolveTier(profile, "deep").model).toBe("deepseek-v4-pro");
    // No effort parameter exists on this provider.
    expect(resolveTier(profile, "deep").params).not.toHaveProperty("outputConfig");
    expect(resolveTier(profile, "deep").params.temperature).toBe(0);
  });

  it("honours an explicitly configured model for non-switching tiers", () => {
    expect(resolveTier(profileFor("anthropic"), "standard", "claude-sonnet-5").model).toBe(
      "claude-sonnet-5",
    );
  });

  it("never sends temperature to a provider that rejects it, for any tier", () => {
    // Guards the Claude Opus 5 400: a future edit to the tier mapping that
    // sets temperature unconditionally fails here rather than at runtime.
    for (const profile of Object.values(PROVIDER_PROFILES)) {
      for (const tier of REASONING_TIERS) {
        const { params } = resolveTier(profile, tier);
        expect(
          "temperature" in params,
          `${profile.provider}/${tier} must not send temperature`,
        ).toBe(profile.acceptsTemperature);
      }
    }
  });

  it("reports providers with no reasoning control so evals can annotate them", () => {
    expect(lacksReasoningControl(profileFor("anthropic"))).toBe(false);
    expect(lacksReasoningControl({ ...profileFor("deepseek"), reasoningControl: "none" })).toBe(
      true,
    );
  });
});

describe("parseSelector", () => {
  it("parses provider:model and falls back to the provider default", () => {
    expect(parseSelector("deepseek:deepseek-v4-pro")).toEqual({
      provider: "deepseek",
      model: "deepseek-v4-pro",
    });
    expect(parseSelector("anthropic")).toEqual({
      provider: "anthropic",
      model: "claude-opus-5",
    });
  });

  it("treats only the first colon as the separator", () => {
    expect(parseSelector("anthropic:vendor:model-1").model).toBe("vendor:model-1");
  });

  it("rejects empty and unknown selectors", () => {
    expect(() => parseSelector("   ")).toThrow(/Empty LLM selector/);
    expect(() => parseSelector("gemini:pro")).toThrow(/Unknown LLM provider/);
  });

  it("round-trips through selectorKey", () => {
    expect(selectorKey(parseSelector("deepseek"))).toBe("deepseek:deepseek-v4-flash");
  });
});

describe("PricingTable", () => {
  const table = new PricingTable({
    "x:cheap": {
      inputPerMTok: 1,
      outputPerMTok: 2,
      cachedInputPerMTok: 0.1,
      verifiedOn: "2026-09-01",
    },
    "x:old": {
      inputPerMTok: 1,
      outputPerMTok: 2,
      cachedInputPerMTok: 0.1,
      verifiedOn: "2020-01-01",
    },
  });

  it("returns rates for a known model and null for an unpriced one", () => {
    expect(table.rates("x:cheap")).toEqual({
      inputPerMTok: 1,
      outputPerMTok: 2,
      cachedInputPerMTok: 0.1,
    });
    expect(table.rates("x:missing")).toBeNull();
  });

  it("flags only entries older than the staleness window", () => {
    const now = new Date("2026-09-09T00:00:00Z");
    expect(table.staleKeys(now)).toEqual(["x:old"]);
    const justInside = new Date(Date.parse("2026-09-01") + (STALE_AFTER_DAYS - 1) * 86_400_000);
    expect(table.staleKeys(justInside)).not.toContain("x:cheap");
  });
});

describe("loadPricing", () => {
  it("loads the committed table and prices every wired provider tier", async () => {
    const pricing = await loadPricing();
    for (const key of [
      "anthropic:claude-opus-5",
      "deepseek:deepseek-v4-flash",
      "deepseek:deepseek-v4-pro",
    ]) {
      expect(pricing.rates(key), `${key} must be priced`).not.toBeNull();
    }
  });

  it("fails actionably when the table is missing", async () => {
    await expect(loadPricing("/nonexistent-dir")).rejects.toThrow(/Pricing table not found/);
  });
});

describe("ProviderRegistry", () => {
  it("resolves rates per tier, following the deep-tier model switch", async () => {
    const pricing = await loadPricing();
    const registry = new ProviderRegistry(parseSelector("deepseek"), pricing);

    expect(registry.id).toBe("deepseek:deepseek-v4-flash");
    // Deep swaps to the pro model, so its rates must differ from the light tier.
    expect(registry.ratesFor("light")).toEqual(pricing.rates("deepseek:deepseek-v4-flash"));
    expect(registry.ratesFor("deep")).toEqual(pricing.rates("deepseek:deepseek-v4-pro"));
    expect(registry.ratesFor("deep")).not.toEqual(registry.ratesFor("light"));
  });

  it("returns null rates for a model absent from the pricing table", async () => {
    const registry = new ProviderRegistry(
      parseSelector("anthropic:claude-not-priced-1"),
      await loadPricing(),
    );
    expect(registry.ratesFor("standard")).toBeNull();
  });

  it("reports credential presence from the provider's own env var", async () => {
    const registry = new ProviderRegistry(parseSelector("deepseek"), await loadPricing());
    expect(registry.profile.apiKeyEnv).toBe("DEEPSEEK_API_KEY");
    expect(registry.hasCredential({})).toBe(false);
    expect(registry.hasCredential({ DEEPSEEK_API_KEY: "sk-test" })).toBe(true);
    // An empty .env line must not count as configured.
    expect(registry.hasCredential({ DEEPSEEK_API_KEY: "" })).toBe(false);
  });

  it("lazily constructs a real chat model without touching the network", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-not-used");
    try {
      const registry = new ProviderRegistry(parseSelector("deepseek"), await loadPricing());
      const model = await registry.model("standard");
      expect(model).toBeDefined();
      // Memoised per tier: the same promise is handed back.
      expect(await registry.model("standard")).toBe(model);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
