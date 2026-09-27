import { describe, expect, it } from "vitest";
import { isThin, qualityGaps, sensitiveAreas, tempered } from "../src";

describe("process quality", () => {
  it("flags thin processes", () => {
    expect(isThin({ confidence: 0.35, stepsCount: 0, estimatedOccurrencesPerMonth: null, estimatedMinutesPerOccurrence: null })).toBe(true);
    expect(qualityGaps({ confidence: 0.8, stepsCount: 1, estimatedOccurrencesPerMonth: 100, estimatedMinutesPerOccurrence: 5 })).toEqual(["Only one step; describe the workflow"]);
    expect(isThin({ confidence: 0.8, stepsCount: 5, estimatedOccurrencesPerMonth: 100, estimatedMinutesPerOccurrence: 5 })).toBe(false);
  });
  it("tempers scores on thin evidence", () => {
    expect(tempered({ businessValue: 5, potentialAutonomyLevel: 4, currentAutonomyLevel: 1 }, true)).toEqual({ businessValue: 3, potentialAutonomyLevel: 2, currentAutonomyLevel: 1 });
    expect(tempered({ businessValue: 5, potentialAutonomyLevel: 4, currentAutonomyLevel: 1 }, false).businessValue).toBe(5);
  });
  it("finds sensitive areas", () => {
    expect(sensitiveAreas("Overdue invoice collections for breeders")).toEqual(["debt collection", "refunds and payments"]);
    expect(sensitiveAreas("Adoption story curation with consent and removal")).toEqual(["personal data and consent"]);
    expect(sensitiveAreas("Weekly status reporting")).toEqual([]);
  });
});
