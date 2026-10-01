import { describe, expect, it } from "vitest";
import { evaluateApprovedAction, evaluatePolicy, refundPolicy, defaultPolicy, type PolicyContext } from "../src";
import { REFUND_TOOLS } from "./fixtures";

const refund = (amount: number, extra: Record<string, unknown> = {}) => ({ payment_id: "ch_1", amount, currency: "eur", reason: "requested_by_customer", ...extra });

function ctx(overrides: Partial<PolicyContext> = {}): PolicyContext {
  const level = overrides.autonomyLevel ?? 4;
  return {
    mode: "production",
    autonomyLevel: level,
    agentStatus: "active",
    organizationPaused: false,
    allowedTools: REFUND_TOOLS,
    policy: refundPolicy(level),
    modelConfidence: 0.95,
    modelRequestedApproval: false,
    actionsThisRun: 0,
    actionsToday: 0,
    now: new Date("2026-09-24T10:00:00Z"),
    ...overrides,
  };
}

describe("policy engine", () => {
  it("Approve mode requires approval for every refund, even €1", () => {
    const e = evaluatePolicy("stripe.create_refund", refund(1), ctx({ autonomyLevel: 3 }));
    expect(e.outcome).toBe("require_approval");
  });

  it("Approve mode requires approval for a customer reply too", () => {
    const e = evaluatePolicy("zendesk.send_reply", { ticket_id: "1", body: "hi", public: true }, ctx({ autonomyLevel: 3 }));
    expect(e.outcome).toBe("require_approval");
  });

  it("Auto executes a refund at or below the limit", () => {
    expect(evaluatePolicy("stripe.create_refund", refund(100), ctx()).outcome).toBe("allow");
  });

  it("Auto asks for approval above the limit", () => {
    const e = evaluatePolicy("stripe.create_refund", refund(100.01), ctx());
    expect(e.outcome).toBe("require_approval");
    expect(e.reasons.join()).toMatch(/above the limit/);
  });

  it("low model confidence forces approval regardless of amount", () => {
    expect(evaluatePolicy("stripe.create_refund", refund(10), ctx({ modelConfidence: 0.5 })).outcome).toBe("require_approval");
  });

  it("missing confidence forces approval", () => {
    expect(evaluatePolicy("stripe.create_refund", refund(10), ctx({ modelConfidence: undefined })).outcome).toBe("require_approval");
  });

  it("the model can make an action stricter, never looser", () => {
    expect(evaluatePolicy("stripe.create_refund", refund(10), ctx({ modelRequestedApproval: true })).outcome).toBe("require_approval");
  });

  it("hard limits deny, and approval does not override them", () => {
    expect(evaluatePolicy("stripe.create_refund", refund(5000), ctx()).outcome).toBe("deny");
    expect(evaluateApprovedAction("stripe.create_refund", refund(5000), ctx()).outcome).toBe("deny");
  });

  it("approval satisfies approval gates", () => {
    expect(evaluateApprovedAction("stripe.create_refund", refund(240), ctx({ autonomyLevel: 3, policy: refundPolicy(3) })).outcome).toBe("allow");
  });

  it("tools outside the allowlist are denied", () => {
    const e = evaluatePolicy("slack.post_message", { channel: "#x", text: "y" }, ctx());
    expect(e.outcome).toBe("deny");
  });

  it("unknown tools are denied", () => {
    expect(evaluatePolicy("stripe.delete_customer", {}, ctx({ allowedTools: [...REFUND_TOOLS, "stripe.delete_customer"] })).outcome).toBe("deny");
  });

  it("emergency pause denies every write and every read", () => {
    expect(evaluatePolicy("stripe.create_refund", refund(1), ctx({ organizationPaused: true })).outcome).toBe("deny");
    expect(evaluatePolicy("zendesk.read_ticket", { ticket_id: "1" }, ctx({ organizationPaused: true })).outcome).toBe("deny");
  });

  it("only active agents execute in production", () => {
    expect(evaluatePolicy("stripe.create_refund", refund(1), ctx({ agentStatus: "paused" })).outcome).toBe("deny");
    expect(evaluatePolicy("stripe.create_refund", refund(1), ctx({ agentStatus: "testing", mode: "test" })).outcome).toBe("simulate");
  });

  it("test mode never executes writes but reports the production outcome", () => {
    const e = evaluatePolicy("stripe.create_refund", refund(240), ctx({ mode: "test" }));
    expect(e.outcome).toBe("simulate");
    expect(e.productionOutcome).toBe("require_approval");
    expect(evaluatePolicy("zendesk.read_ticket", { ticket_id: "1" }, ctx({ mode: "test" })).outcome).toBe("allow");
  });

  it("Draft mode turns writes into drafts for a human", () => {
    expect(evaluatePolicy("stripe.create_refund", refund(1), ctx({ autonomyLevel: 2, policy: refundPolicy(2) })).outcome).toBe("draft");
  });

  it("Manual mode never lets the agent act", () => {
    expect(evaluatePolicy("zendesk.read_ticket", { ticket_id: "1" }, ctx({ autonomyLevel: 1 })).outcome).toBe("deny");
  });

  it("enterprise customers require approval via a condition rule", () => {
    const e = evaluatePolicy("stripe.create_refund", refund(20, { customer_segment: "enterprise" }), ctx());
    expect(e.outcome).toBe("require_approval");
  });

  it("high-risk tools need approval by default when no threshold covers them", () => {
    const e = evaluatePolicy("stripe.create_refund", refund(5), ctx({ policy: defaultPolicy() }));
    expect(e.outcome).toBe("require_approval");
    expect(e.reasons.join()).toMatch(/High-risk/);
  });

  it("enforces maximum actions per run and per day", () => {
    expect(evaluatePolicy("stripe.create_refund", refund(5), ctx({ actionsThisRun: 6 })).outcome).toBe("deny");
    expect(evaluatePolicy("stripe.create_refund", refund(5), ctx({ actionsToday: 200 })).outcome).toBe("deny");
  });

  it("outside working hours requires approval", () => {
    const policy = { ...refundPolicy(4), workingHours: { timezone: "Europe/Amsterdam", days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" } };
    // 2026-09-26 is a Saturday
    expect(evaluatePolicy("stripe.create_refund", refund(5), ctx({ policy, now: new Date("2026-09-26T10:00:00Z") })).outcome).toBe("require_approval");
    expect(evaluatePolicy("stripe.create_refund", refund(5), ctx({ policy, now: new Date("2026-09-24T10:00:00Z") })).outcome).toBe("allow");
  });

  it("a missing amount on a thresholded tool requires approval", () => {
    expect(evaluatePolicy("stripe.create_refund", { payment_id: "x", currency: "eur" }, ctx()).outcome).not.toBe("allow");
  });
});

describe("warehouse queries", () => {
  const scoped = (dataScopes: Array<{ tool: string; project: string; dataset: string }>) =>
    ctx({ autonomyLevel: 3, allowedTools: ["warehouse.query"], policy: { ...refundPolicy(3), dataScopes } });
  const query = (sql: string, extra: Record<string, unknown> = {}) => ({ project_id: "pmg-prod", dataset: "crm", sql, ...extra });
  const scope = [{ tool: "warehouse.query", project: "pmg-prod", dataset: "crm" }];

  it("runs a lookup inside the allowed dataset without approval, even at L3", () => {
    expect(evaluatePolicy("warehouse.query", query("SELECT plan FROM crm.customers WHERE email = 'a@b.com'"), scoped(scope)).outcome).toBe("allow");
  });

  it("denies a query when the agent has no dataset", () => {
    const e = evaluatePolicy("warehouse.query", query("SELECT 1 FROM crm.customers"), scoped([]));
    expect(e.outcome).toBe("deny");
    expect(e.reasons.join(" ")).toMatch(/No dataset/);
  });

  it("denies another dataset, another project and anything but a SELECT", () => {
    expect(evaluatePolicy("warehouse.query", query("SELECT * FROM hr.salaries", { dataset: "hr" }), scoped(scope)).outcome).toBe("deny");
    expect(evaluatePolicy("warehouse.query", query("SELECT * FROM crm.customers", { project_id: "other" }), scoped(scope)).outcome).toBe("deny");
    expect(evaluatePolicy("warehouse.query", query("SELECT * FROM crm.customers c JOIN hr.salaries s ON s.id = c.id"), scoped(scope)).outcome).toBe("deny");
    expect(evaluatePolicy("warehouse.query", query("DELETE FROM crm.customers WHERE true"), scoped(scope)).outcome).toBe("deny");
  });
});
