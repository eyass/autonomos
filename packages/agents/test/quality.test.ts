import { describe, expect, it } from "vitest";
import { isThin, MONEY_APPROVAL_ABOVE, MONEY_HARD_LIMIT, qualityGaps, sensitiveAreas, tempered } from "../src";

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

const base = {
  autonomyLevel: 5,
  tools: ["zendesk.send_reply", "stripe.create_refund"],
  policy: {
    approvalRequiredFor: [] as string[],
    amountThresholds: [{ tool: "stripe.create_refund", field: "amount", maxWithoutApproval: 200 }],
    hardLimits: [] as Array<{ tool: string; field: string; max: number }>,
  },
};

describe("compliance guardrails", () => {
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

describe("evidence and policy thresholds", () => {
  it("asks a person to confirm an inferred draft nothing backs", async () => {
    const { needsConfirmation, qualityGaps } = await import("../src");
    const p = { confidence: 0.55, stepsCount: 4, estimatedOccurrencesPerMonth: 100, estimatedMinutesPerOccurrence: 5 };
    expect(qualityGaps({ ...p, evidenceCount: 0 })).toEqual([]);
    expect(needsConfirmation({ ...p, evidenceCount: 0 })).toBe(true);
    expect(needsConfirmation({ ...p, evidenceCount: 2 })).toBe(false);
    expect(needsConfirmation({ ...p, confidence: 0.7, evidenceCount: 0 })).toBe(false);
    // Unknown evidence (an interview or a document) and a person-confirmed process skip the rule.
    expect(needsConfirmation(p)).toBe(false);
    expect(needsConfirmation({ ...p, confidence: null, evidenceCount: 0 })).toBe(false);
  });
  it("lists the policy numbers each regulated area still needs", async () => {
    const { policyGaps } = await import("../src");
    expect(policyGaps(["refunds and payments"], {})[0]).toMatch(/refunds and payments policy: a person approves/);
    expect(policyGaps(["refunds and payments"], { approvalAbove: 30, maxPerAction: 200, windowDays: 14 })).toEqual([]);
    expect(policyGaps(["debt collection"], { minBalance: 10, graceDays: 7, maxRemindersPerMonth: 3 })).toEqual(["set the debt collection policy: hand to a person (small claims or legal) above"]);
    expect(policyGaps(["legal and contracts"], {})).toEqual([]);
  });
  it("tightens money limits with the company's numbers, never loosens them", async () => {
    const { applyGuardrails } = await import("../src");
    const tight = applyGuardrails(base, ["refunds and payments"], ["zendesk.send_reply", "stripe.create_refund"], { approvalAbove: 30, maxPerAction: 200, windowDays: 14 });
    expect(tight.policy.amountThresholds[0]!.maxWithoutApproval).toBe(30);
    expect(tight.policy.hardLimits[0]!.max).toBe(200);
    const loose = applyGuardrails(base, ["refunds and payments"], ["zendesk.send_reply", "stripe.create_refund"], { approvalAbove: 5000, maxPerAction: 9000, windowDays: 14 });
    expect(loose.policy.amountThresholds[0]!.maxWithoutApproval).toBe(MONEY_APPROVAL_ABOVE);
    expect(loose.policy.hardLimits[0]!.max).toBe(MONEY_HARD_LIMIT);
  });
  it("turns collections and consent policy into rules and escalations", async () => {
    const { applyGuardrails } = await import("../src");
    const withInstructions = { ...base, instructions: { rules: [], escalationConditions: [] } };
    const c = applyGuardrails(withInstructions, ["debt collection"], ["zendesk.send_reply"], { minBalance: 20, escalateAbove: 1000, graceDays: 7, maxRemindersPerMonth: 3 });
    expect(c.instructions!.rules).toContain("At most 3 reminders per customer per month");
    expect(c.instructions!.escalationConditions).toContain("The balance is above 1000: hand to a person for small claims or legal");
    expect(c.policy.approvalRequiredFor).toContain("zendesk.send_reply");
  });
});
