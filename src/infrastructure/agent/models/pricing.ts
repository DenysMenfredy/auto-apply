import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ModelRates } from "../../../domain/agent/budget.js";

const rateSchema = z.object({
  inputPerMTok: z.number().nonnegative(),
  outputPerMTok: z.number().nonnegative(),
  cachedInputPerMTok: z.number().nonnegative(),
  verifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "verifiedOn must be YYYY-MM-DD"),
  source: z.string().optional(),
  note: z.string().optional(),
});

const pricingSchema = z.object({
  models: z.record(z.string(), rateSchema),
});

export type ModelPricing = z.infer<typeof rateSchema>;

/** Rates are stale past this age and doctor warns (AGENT_PLAN §5.1). */
export const STALE_AFTER_DAYS = 90;

export class PricingTable {
  constructor(private readonly models: Record<string, ModelPricing>) {}

  /** Rates for `provider:model`, or null when the model is not priced. */
  rates(key: string): ModelRates | null {
    const entry = this.models[key];
    if (!entry) return null;
    return {
      inputPerMTok: entry.inputPerMTok,
      outputPerMTok: entry.outputPerMTok,
      cachedInputPerMTok: entry.cachedInputPerMTok,
    };
  }

  entry(key: string): ModelPricing | null {
    return this.models[key] ?? null;
  }

  keys(): string[] {
    return Object.keys(this.models);
  }

  /** Entries whose `verifiedOn` is older than `STALE_AFTER_DAYS`. */
  staleKeys(now: Date = new Date()): string[] {
    const cutoffMs = STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
    return Object.entries(this.models)
      .filter(([, entry]) => now.getTime() - Date.parse(entry.verifiedOn) > cutoffMs)
      .map(([key]) => key);
  }
}

export async function loadPricing(cwd: string = process.cwd()): Promise<PricingTable> {
  const filePath = path.join(cwd, "configs", "pricing.json");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(filePath, "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Pricing table not found at ${filePath}. Budgets cannot be enforced without it.`,
      );
    }
    throw new Error(`Invalid pricing table at ${filePath}: ${(error as Error).message}`);
  }

  const parsed = pricingSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Invalid pricing table: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return new PricingTable(parsed.data.models);
}
