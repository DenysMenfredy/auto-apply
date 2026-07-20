import { KeywordMatchEngine } from "@domain/matching/keyword-match-engine.js";
import { categorize } from "@domain/matching/match-result.js";
import { rankResults } from "@domain/matching/ranking.js";
import { describe, expect, it } from "vitest";
import { makeCandidate, makeJob } from "../helpers/fakes.js";

const engine = new KeywordMatchEngine();

describe("KeywordMatchEngine (RF-009)", () => {
  it("scores a strong match above 90", async () => {
    const result = await engine.evaluate(makeCandidate(), makeJob());
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.matchedSkills).toEqual(["Node.js", "TypeScript", "AWS"]);
    expect(result.missingSkills).toEqual([]);
  });

  it("penalizes missing technologies and reports them", async () => {
    const job = makeJob({ technologies: ["Java", "Kafka", "Kubernetes"] });
    const result = await engine.evaluate(makeCandidate(), job);
    expect(result.score).toBeLessThan(70);
    expect(result.missingSkills).toEqual(["Java", "Kafka", "Kubernetes"]);
    expect(result.weaknesses.some((w) => w.includes("Missing"))).toBe(true);
  });

  it("keeps scores inside 0-100", async () => {
    const worstCandidate = makeCandidate({
      skills: [],
      technologies: [],
      seniority: "intern",
      yearsExperience: 0,
      preferredLocations: ["LATAM"],
    });
    const job = makeJob({
      technologies: ["Java", "Kafka", "AWS", "PyTorch"],
      seniority: "principal",
      location: "On-site Tokyo",
      remote: false,
      requirements: ["10+ years of experience"],
    });
    const result = await engine.evaluate(worstCandidate, job);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("penalizes seniority gaps", async () => {
    const junior = makeCandidate({ seniority: "junior", yearsExperience: 1 });
    const seniorJob = makeJob({ seniority: "principal" });
    const result = await engine.evaluate(junior, seniorJob);
    expect(result.weaknesses.some((w) => w.includes("Seniority gap"))).toBe(true);
  });

  it("penalizes unmet years-of-experience requirements", async () => {
    const candidate = makeCandidate({ yearsExperience: 2 });
    const job = makeJob({ requirements: ["7+ years of backend experience"] });
    const result = await engine.evaluate(candidate, job);
    expect(result.weaknesses.some((w) => w.includes("7+ years"))).toBe(true);
  });

  it("rewards preferred locations", async () => {
    const candidate = makeCandidate({ preferredLocations: ["Remote"] });
    const remote = await engine.evaluate(candidate, makeJob({ remote: true }));
    const onsite = await engine.evaluate(
      candidate,
      makeJob({ remote: false, location: "Tokyo, Japan" }),
    );
    expect(remote.score).toBeGreaterThan(onsite.score);
  });
});

describe("categorize (RF-010)", () => {
  it("maps scores to bands", () => {
    expect(categorize(95)).toBe("excellent");
    expect(categorize(85)).toBe("very-good");
    expect(categorize(75)).toBe("good");
    expect(categorize(69)).toBe("discard");
  });
});

describe("rankResults", () => {
  it("sorts descending and applies minScore/limit", async () => {
    const candidate = makeCandidate();
    const strong = await engine.evaluate(candidate, makeJob());
    const weak = await engine.evaluate(candidate, makeJob({ technologies: ["Java", "Kafka"] }));

    const ranked = rankResults([weak, strong]);
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(ranked[1]?.score ?? 0);

    expect(rankResults([weak, strong], { minScore: strong.score })).toHaveLength(1);
    expect(rankResults([weak, strong], { limit: 1 })).toHaveLength(1);
  });
});
