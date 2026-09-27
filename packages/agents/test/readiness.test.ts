import { describe, expect, it } from "vitest";
import { hasData, isPassedTest, testGate, toolGate, type TestRunSummary } from "../src";

const run = (over: Partial<TestRunSummary> = {}): TestRunSummary => ({
  status: "completed",
  outcome: "test_passed",
  success: true,
  input: { ticket_id: "t_1" },
  versionId: "v2",
  summary: null,
  ...over,
});

describe("test gate", () => {
  it("needs data in the input", () => {
    expect(hasData({})).toBe(false);
    expect(hasData({ a: "", b: {} })).toBe(false);
    expect(hasData({ ticket_id: "t_1" })).toBe(true);
    expect(hasData({ request: "A typical request for Refund Agent", details: "Add the facts the agent needs" })).toBe(false);
    expect(isPassedTest(run({ input: {} }))).toBe(false);
  });
  it("finished is not passed", () => {
    expect(isPassedTest(run({ outcome: "escalated", success: false }))).toBe(false);
    expect(isPassedTest(run({ outcome: "test_unsuccessful", success: false }))).toBe(false);
    expect(isPassedTest(run({ status: "failed", outcome: "failed", success: false }))).toBe(false);
    expect(isPassedTest(run())).toBe(true);
  });
  it("the newest test on the current version decides", () => {
    expect(testGate([run({ outcome: "escalated", success: false, summary: "No order id" }), run()], "v2")).toMatchObject({ ok: false });
    expect(testGate([run({ outcome: "escalated", success: false, summary: "No order id" })], "v2").detail).toContain("handed to a person");
    expect(testGate([run(), run({ status: "failed" })], "v2").ok).toBe(true);
    expect(testGate([run({ versionId: "v1" })], "v2").detail).toContain("configuration changed");
    expect(testGate([], "v2").ok).toBe(false);
  });
});

describe("tool gate", () => {
  it("needs a read tool and a tool for the triggering system", () => {
    const slack = { key: "slack.post_message", access: "write" as const, integration: "slack" };
    const zdRead = { key: "zendesk.read_ticket", access: "read" as const, integration: "zendesk" };
    expect(toolGate([slack], { type: "manual" }).ok).toBe(false);
    expect(toolGate([slack, { key: "gmail.search", access: "read", integration: "gmail" }], { type: "integration_event", event: "zendesk.ticket.created" }).ok).toBe(false);
    expect(toolGate([slack, zdRead], { type: "integration_event", event: "zendesk.ticket.created" }).ok).toBe(true);
    expect(toolGate([{ key: "knowledge.search", access: "read", integration: "knowledge" }], { type: "manual" }).ok).toBe(false);
  });
});
