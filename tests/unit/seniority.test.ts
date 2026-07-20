import {
  inferSeniority,
  inferSeniorityFromTitle,
  inferSeniorityFromYears,
  seniorityRank,
} from "@domain/candidate/seniority.js";
import { describe, expect, it } from "vitest";

describe("inferSeniorityFromTitle", () => {
  it.each([
    ["Senior Software Engineer", "senior"],
    ["Sr. Backend Developer", "senior"],
    ["Staff Engineer", "staff"],
    ["Principal Engineer", "principal"],
    ["Junior Developer", "junior"],
    ["Engineering Intern", "intern"],
    ["Software Engineer", "unknown"],
  ])("%s -> %s", (title, expected) => {
    expect(inferSeniorityFromTitle(title)).toBe(expected);
  });
});

describe("inferSeniorityFromYears", () => {
  it("maps year ranges to levels", () => {
    expect(inferSeniorityFromYears(0.5)).toBe("junior");
    expect(inferSeniorityFromYears(2)).toBe("mid");
    expect(inferSeniorityFromYears(6)).toBe("senior");
    expect(inferSeniorityFromYears(10)).toBe("staff");
  });
});

describe("inferSeniority", () => {
  it("prefers title signals over years", () => {
    expect(inferSeniority(["Junior Engineer"], 10)).toBe("junior");
  });

  it("falls back to years when titles carry no signal", () => {
    expect(inferSeniority(["Software Engineer"], 6)).toBe("senior");
  });
});

describe("seniorityRank", () => {
  it("orders levels and marks unknown as -1", () => {
    expect(seniorityRank("junior")).toBeLessThan(seniorityRank("senior"));
    expect(seniorityRank("unknown")).toBe(-1);
  });
});
