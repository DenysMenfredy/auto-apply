/**
 * Run budgeting and cost arithmetic (AGENT_PLAN §5).
 *
 * Pure domain rules: no provider names, no framework, no I/O. Rates arrive
 * from the pricing table so the same arithmetic serves every vendor.
 */

/** Token usage reported by a single model call. */
export interface TokenUsage {
  inputTokens: number;
  /** Portion of `inputTokens` served from a prompt cache, billed cheaper. */
  cachedInputTokens: number;
  outputTokens: number;
}

/** USD per million tokens for one model. */
export interface ModelRates {
  inputPerMTok: number;
  outputPerMTok: number;
  cachedInputPerMTok: number;
}

export interface RunBudget {
  maxUsd: number;
  maxModelCalls: number;
  maxToolCalls: number;
}

export const DEFAULT_RUN_BUDGET: RunBudget = {
  maxUsd: 3,
  maxModelCalls: 40,
  maxToolCalls: 120,
};

const PER_MILLION = 1_000_000;

/**
 * Cost of one call. `cachedInputTokens` is treated as a subset of
 * `inputTokens` (that is how providers report it), so it is billed at the
 * cache rate and the remainder at the full rate.
 */
export function costOf(usage: TokenUsage, rates: ModelRates): number {
  const cached = Math.min(Math.max(usage.cachedInputTokens, 0), Math.max(usage.inputTokens, 0));
  const uncached = Math.max(usage.inputTokens, 0) - cached;
  return (
    (uncached * rates.inputPerMTok +
      cached * rates.cachedInputPerMTok +
      Math.max(usage.outputTokens, 0) * rates.outputPerMTok) /
    PER_MILLION
  );
}

export type BudgetBreach = "usd" | "model-calls" | "tool-calls";

/**
 * Running total for one agent run. Budget exhaustion is not an error: the run
 * stops and returns what it already found (§5.4), so the ledger reports a
 * breach rather than throwing.
 */
export class BudgetLedger {
  private usd = 0;
  private modelCalls = 0;
  private toolCalls = 0;

  constructor(private readonly budget: RunBudget = DEFAULT_RUN_BUDGET) {}

  recordModelCall(usage: TokenUsage, rates: ModelRates): void {
    this.usd += costOf(usage, rates);
    this.modelCalls += 1;
  }

  recordToolCall(): void {
    this.toolCalls += 1;
  }

  get spentUsd(): number {
    return this.usd;
  }

  get remainingUsd(): number {
    return Math.max(this.budget.maxUsd - this.usd, 0);
  }

  get counts(): { modelCalls: number; toolCalls: number } {
    return { modelCalls: this.modelCalls, toolCalls: this.toolCalls };
  }

  /** The first ceiling that has been reached, or null while within budget. */
  breach(): BudgetBreach | null {
    if (this.usd >= this.budget.maxUsd) return "usd";
    if (this.modelCalls >= this.budget.maxModelCalls) return "model-calls";
    if (this.toolCalls >= this.budget.maxToolCalls) return "tool-calls";
    return null;
  }
}

export interface JudgeTopNInput {
  /** USD still available for judging. */
  budgetUsd: number;
  /** Estimated cost of judging one job on the configured provider. */
  perJobCostUsd: number;
  /** How many jobs discovery actually turned up. */
  discovered: number;
  /** Never judge fewer than this, even on a tiny budget. */
  floor?: number;
}

/**
 * How many jobs reach the LLM judge (§5.3).
 *
 * The keyword prefilter exists because judging every job with a frontier model
 * is expensive. On a provider an order of magnitude cheaper that constraint
 * weakens, so this is derived from price rather than hardcoded: the same
 * ceiling buys ~30 judgements on an expensive model or the whole candidate set
 * on a cheap one, with no config change.
 */
export function deriveJudgeTopN({
  budgetUsd,
  perJobCostUsd,
  discovered,
  floor = 10,
}: JudgeTopNInput): number {
  if (discovered <= 0) return 0;
  const effectiveFloor = Math.min(floor, discovered);
  // A free or unpriced model imposes no budget limit; recall is then the only
  // consideration, so judge everything.
  if (perJobCostUsd <= 0) return discovered;
  const affordable = Math.floor(Math.max(budgetUsd, 0) / perJobCostUsd);
  return Math.min(discovered, Math.max(affordable, effectiveFloor));
}
