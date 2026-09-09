import { BudgetLedger, type ModelRates, costOf, deriveJudgeTopN } from "@domain/agent/budget.js";
import { describe, expect, it } from "vitest";

const OPUS: ModelRates = { inputPerMTok: 5, outputPerMTok: 25, cachedInputPerMTok: 0.5 };
const FLASH: ModelRates = { inputPerMTok: 0.44, outputPerMTok: 1.32, cachedInputPerMTok: 0.014 };

describe("costOf", () => {
  it("bills cached tokens at the cache rate and the remainder at full rate", () => {
    // 3K cached + 4K uncached + 0.8K out — the per-judged-job shape in §5.2.
    const cost = costOf({ inputTokens: 7_000, cachedInputTokens: 3_000, outputTokens: 800 }, OPUS);
    expect(cost).toBeCloseTo(0.0015 + 0.02 + 0.02, 6);
  });

  it("never bills more cached tokens than were sent", () => {
    const cost = costOf({ inputTokens: 100, cachedInputTokens: 900, outputTokens: 0 }, OPUS);
    expect(cost).toBeCloseTo((100 * 0.5) / 1_000_000, 9);
  });

  it("treats negative counts as zero", () => {
    expect(costOf({ inputTokens: -5, cachedInputTokens: -5, outputTokens: -5 }, OPUS)).toBe(0);
  });
});

describe("BudgetLedger", () => {
  const usage = { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 };

  it("accumulates spend and reports the remainder", () => {
    const ledger = new BudgetLedger({ maxUsd: 12, maxModelCalls: 10, maxToolCalls: 10 });
    ledger.recordModelCall(usage, OPUS);
    expect(ledger.spentUsd).toBeCloseTo(5, 6);
    expect(ledger.remainingUsd).toBeCloseTo(7, 6);
    expect(ledger.breach()).toBeNull();
  });

  it("reports a usd breach at the ceiling", () => {
    const ledger = new BudgetLedger({ maxUsd: 3, maxModelCalls: 10, maxToolCalls: 10 });
    ledger.recordModelCall(usage, OPUS);
    expect(ledger.breach()).toBe("usd");
    expect(ledger.remainingUsd).toBe(0);
  });

  it("reports call-count breaches independently of spend", () => {
    const ledger = new BudgetLedger({ maxUsd: 100, maxModelCalls: 100, maxToolCalls: 2 });
    ledger.recordToolCall();
    expect(ledger.breach()).toBeNull();
    ledger.recordToolCall();
    expect(ledger.breach()).toBe("tool-calls");
    expect(ledger.counts).toEqual({ modelCalls: 0, toolCalls: 2 });
  });
});

describe("deriveJudgeTopN (§5.3)", () => {
  // Judging one job costs ~$0.042 on Opus 5 and ~$0.0029 on deepseek-v4-flash.
  const OPUS_PER_JOB = 0.042;
  const FLASH_PER_JOB = costOf(
    { inputTokens: 7_000, cachedInputTokens: 3_000, outputTokens: 800 },
    FLASH,
  );

  it("caps an expensive provider to roughly the documented 30 survivors", () => {
    const n = deriveJudgeTopN({
      budgetUsd: 1.25,
      perJobCostUsd: OPUS_PER_JOB,
      discovered: 100,
    });
    expect(n).toBe(29);
  });

  it("lets a cheap provider judge the whole candidate set on the same budget", () => {
    const n = deriveJudgeTopN({
      budgetUsd: 1.25,
      perJobCostUsd: FLASH_PER_JOB,
      discovered: 100,
    });
    expect(n).toBe(100);
  });

  it("never exceeds what discovery actually found", () => {
    expect(deriveJudgeTopN({ budgetUsd: 50, perJobCostUsd: 0.001, discovered: 7 })).toBe(7);
  });

  it("honours the floor on a tiny budget but never past what was discovered", () => {
    expect(deriveJudgeTopN({ budgetUsd: 0, perJobCostUsd: 0.042, discovered: 100 })).toBe(10);
    expect(deriveJudgeTopN({ budgetUsd: 0, perJobCostUsd: 0.042, discovered: 3 })).toBe(3);
  });

  it("judges everything when the model is free or unpriced", () => {
    expect(deriveJudgeTopN({ budgetUsd: 0, perJobCostUsd: 0, discovered: 42 })).toBe(42);
  });

  it("returns zero when nothing was discovered", () => {
    expect(deriveJudgeTopN({ budgetUsd: 3, perJobCostUsd: 0.042, discovered: 0 })).toBe(0);
  });
});
