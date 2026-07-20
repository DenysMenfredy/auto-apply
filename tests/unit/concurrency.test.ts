import { mapWithConcurrency } from "@shared/utils/concurrency.js";
import { describe, expect, it } from "vitest";

describe("mapWithConcurrency", () => {
  it("preserves input order", async () => {
    const results = await mapWithConcurrency([3, 1, 2], 2, async (n) => {
      await new Promise((resolve) => setTimeout(resolve, n * 5));
      return n * 10;
    });
    expect(results).toEqual([30, 10, 20]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      },
    );
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("rejects invalid limits", async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow(/>= 1/);
  });

  it("handles empty input", async () => {
    expect(await mapWithConcurrency([], 4, async (n) => n)).toEqual([]);
  });
});
