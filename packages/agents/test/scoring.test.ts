import { describe, expect, it } from "vitest";
import { agentStats, autonomyRecommendation, autonomyScore, opportunityScore } from "../src";

describe("metrics", () => {
  it("computes the share of work on agents from monthly time and coefficients", () => {
    const processes = [
      { id: "a", departmentId: null, status: "active", currentAutonomyLevel: 1 as const, estimatedOccurrencesPerMonth: 10, estimatedMinutesPerOccurrence: 60 },
      { id: "b", departmentId: null, status: "active", currentAutonomyLevel: 1 as const, estimatedOccurrencesPerMonth: 10, estimatedMinutesPerOccurrence: 60 },
    ];
    expect(autonomyScore(processes, new Map())).toBe(0);
    expect(autonomyScore(processes, new Map([["a", 4]]))).toBeCloseTo(0.4);
    expect(autonomyScore([], new Map())).toBeNull();
  });

  it("ranks by value × potential ÷ difficulty", () => {
    const easy = opportunityScore({ businessValue: 4, automationDifficulty: 2, currentAutonomyLevel: 1, targetAutonomyLevel: 4 });
    const hard = opportunityScore({ businessValue: 4, automationDifficulty: 5, currentAutonomyLevel: 1, targetAutonomyLevel: 4 });
    expect(easy).toBeGreaterThan(hard);
  });

  it("recommends promotion only with strong evidence", () => {
    const runs = Array.from({ length: 30 }, () => ({ mode: "production" as const, status: "completed", outcome: "completed", success: true, modelCost: 0.01, estimatedMinutesSaved: 7, hadIntervention: true }));
    const approvals = Array.from({ length: 30 }, () => ({ status: "approved" }));
    const stats = agentStats(runs, approvals, 45);
    expect(autonomyRecommendation(3, stats, "Refund")?.direction).toBe("increase");
    const bad = agentStats(runs, [...approvals.slice(0, 10), ...Array.from({ length: 10 }, () => ({ status: "rejected" }))], 45);
    expect(autonomyRecommendation(3, bad, "Refund")?.direction).toBe("decrease");
  });
});
