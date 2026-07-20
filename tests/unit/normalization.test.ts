import {
  extractTechnologies,
  hasCategoryExperience,
  normalizeTechnologies,
  normalizeTechnology,
} from "@domain/matching/normalization.js";
import { describe, expect, it } from "vitest";

describe("normalizeTechnology", () => {
  it("maps aliases to canonical names", () => {
    expect(normalizeTechnology("nodejs")).toBe("Node.js");
    expect(normalizeTechnology("node")).toBe("Node.js");
    expect(normalizeTechnology("TYPESCRIPT")).toBe("TypeScript");
    expect(normalizeTechnology("k8s")).toBe("Kubernetes");
    expect(normalizeTechnology("llms")).toBe("LLM");
  });

  it("keeps unknown labels untouched", () => {
    expect(normalizeTechnology("COBOL")).toBe("COBOL");
  });
});

describe("normalizeTechnologies", () => {
  it("removes duplicates across aliases and casing", () => {
    expect(normalizeTechnologies(["node", "Node.js", "nodejs", "AWS", "aws"])).toEqual([
      "Node.js",
      "AWS",
    ]);
  });

  it("drops empty entries", () => {
    expect(normalizeTechnologies(["", "  ", "Python"])).toEqual(["Python"]);
  });
});

describe("extractTechnologies", () => {
  it("finds technologies in free text on word boundaries", () => {
    const text = "We use Node.js and k8s; experience with LLMs and PostgreSQL required.";
    const found = extractTechnologies(text);
    expect(found).toContain("Node.js");
    expect(found).toContain("Kubernetes");
    expect(found).toContain("LLM");
    expect(found).toContain("PostgreSQL");
  });

  it("does not match substrings of longer words", () => {
    // "go" inside "going", "ai" inside "maintain"
    expect(extractTechnologies("we are going to maintain the system")).toEqual([]);
  });
});

describe("hasCategoryExperience", () => {
  it("classifies backend, ai and cloud stacks", () => {
    expect(hasCategoryExperience(["Node.js"], "backend")).toBe(true);
    expect(hasCategoryExperience(["PyTorch"], "ai")).toBe(true);
    expect(hasCategoryExperience(["AWS"], "cloud")).toBe(true);
    expect(hasCategoryExperience(["React"], "backend")).toBe(false);
  });
});
