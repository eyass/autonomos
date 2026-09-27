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

describe("compliance guardrails", () => {
  const base = {
    autonomyLevel: 5,
    tools: ["zendesk.send_reply", "stripe.create_refund"],
    policy: { approvalRequiredFor: [], amountThresholds: [{ tool: "stripe.create_refund", field: "amount", maxWithoutApproval: 200 }], hardLimits: [] },
  };
  it("caps collections at L3 and puts every write behind approval", async () => {
    const { applyGuardrails } = await import("../src");
    const c = applyGuardrails(base, ["debt collection"], ["zendesk.send_reply", "stripe.create_refund"]);
    expect(c.autonomyLevel).toBe(3);
    expect(c.policy.approvalRequiredFor).toEqual(["zendesk.send_reply", "stripe.create_refund"]);
  });
  it("limits money for refunds and payments", async () => {
    const { applyGuardrails, MONEY_APPROVAL_ABOVE, MONEY_HARD_LIMIT } = await import("../src");
    const c = applyGuardrails(base, ["refunds and payments"], ["zendesk.send_reply", "stripe.create_refund"]);
    expect(c.autonomyLevel).toBe(4);
    expect(c.policy.amountThresholds[0]!.maxWithoutApproval).toBe(MONEY_APPROVAL_ABOVE);
    expect(c.policy.hardLimits).toEqual([{ tool: "stripe.create_refund", field: "amount", max: MONEY_HARD_LIMIT }]);
  });
  it("never limits tools that only read payments", async () => {
    const { applyGuardrails } = await import("../src");
    const c = applyGuardrails({ ...base, tools: [...base.tools, "stripe.list_payments"] }, ["refunds and payments"], ["zendesk.send_reply", "stripe.create_refund"]);
    expect(c.policy.hardLimits.map((l) => l.tool)).toEqual(["stripe.create_refund"]);
    expect(c.policy.amountThresholds.map((l) => l.tool)).toEqual(["stripe.create_refund"]);
  });
  it("leaves other work alone", async () => {
    const { applyGuardrails } = await import("../src");
    expect(applyGuardrails(base, [], [])).toEqual(base);
  });
});
