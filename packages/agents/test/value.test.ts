import { describe, expect, it } from "vitest";
import { processValue, rankByValue, valueVerdict, type ValueCandidate } from "../src";

const p = (over: Partial<ValueCandidate> = {}): ValueCandidate => ({
  title: "Refund request handling",
  description: "Customers ask for refunds through support.",
  estimatedOccurrencesPerMonth: 120,
  estimatedMinutesPerOccurrence: 12,
  currentAutonomyLevel: 1,
  potentialAutonomyLevel: 4,
  confidence: 0.8,
  kind: "recurring_work",
  evidence: [{ source: "Zendesk", detail: "31 of 60 tickets are tagged refund" }],
  ...over,
});

describe("process value", () => {
  it("counts the hours an agent could take over", () => {
    const v = processValue(p(), 45);
    expect(v.hoursPerMonth).toBe(24);
    expect(v.agentHoursPerMonth).toBeGreaterThan(10);
    expect(v.evidenced).toBe(true);
    expect(v.highImpact).toBe(true);
    expect(v.why).toMatch(/take over about \d+ h a month/);
  });
  it("leaves out work that is not worth an agent", () => {
    const tiny = p({ title: "Update the team wiki", description: "Add a line to the wiki", estimatedOccurrencesPerMonth: 2, estimatedMinutesPerOccurrence: 10 });
    expect(valueVerdict(tiny, processValue(tiny, 45))).toBe("Saves less than an hour a month");
    const chore = p({ title: "Newsletter reading", description: "Read industry newsletters", estimatedOccurrencesPerMonth: 20, estimatedMinutesPerOccurrence: 10 });
    expect(valueVerdict(chore, processValue(chore, 45))).toBe("A routine chore with little at stake");
    const flat = p({ potentialAutonomyLevel: 1 });
    expect(valueVerdict(flat, processValue(flat, 45))).toBe("Nothing for an agent to take over");
    const guess = p({
      title: "Vendor onboarding",
      description: "Set up new vendors",
      confidence: 0.4,
      evidence: [{ source: "Company profile", detail: "Likely for a marketplace" }],
      estimatedOccurrencesPerMonth: 4,
      estimatedMinutesPerOccurrence: 30,
    });
    expect(valueVerdict(guess, processValue(guess, 45))).toBe("A guess with little at stake");
  });
  it("keeps quick work that protects money", () => {
    const failed = p({ title: "Failed payment follow-up", description: "Email customers whose payment failed", estimatedOccurrencesPerMonth: 6, estimatedMinutesPerOccurrence: 5 });
    expect(valueVerdict(failed, processValue(failed, 45))).toBeNull();
  });
  it("ranks by value and caps the list", () => {
    const small = p({ title: "Order status enquiries", description: "Where is my order", estimatedOccurrencesPerMonth: 20, estimatedMinutesPerOccurrence: 5 });
    const { kept, dropped } = rankByValue([small, p()], 45, 1);
    expect(kept.map((k) => k.title)).toEqual(["Refund request handling"]);
    expect(dropped).toEqual([{ title: "Order status enquiries", reason: "Lower value than the ones shown" }]);
  });
});
