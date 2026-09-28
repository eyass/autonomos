import { describe, expect, it } from "vitest";
import { choosePlaybookTools, closestTools, generatePlaybook } from "./tasks/playbooks";

process.env.AI_MOCK = "1";

const capabilities = [
  { key: "helpdesk", label: "Help desk", hint: "" },
  { key: "payments", label: "Payments", hint: "" },
];

const helpdesk = [
  { key: "zendesk.read_ticket", label: "Read support tickets", description: "Reads a ticket and its comments", access: "read" as const, integration: "zendesk" },
  { key: "zendesk.send_reply", label: "Reply to customers on tickets", description: "Replies on a ticket", access: "write" as const, integration: "zendesk" },
];
const payments = [
  { key: "stripe.find_customer", label: "Look up customers", description: "Finds a customer by email", access: "read" as const, integration: "stripe" },
  { key: "stripe.list_payments", label: "Read payments", description: "Lists a customer's payments", access: "read" as const, integration: "stripe" },
  { key: "stripe.create_refund", label: "Create refunds", description: "Refunds a payment", access: "write" as const, integration: "stripe" },
];

describe("generatePlaybook", () => {
  it("drafts tool-neutral steps that name a capability", async () => {
    const p = await generatePlaybook({ goal: "handle refund requests", capabilities, existingTitles: [] });
    expect(p.steps.length).toBeGreaterThanOrEqual(3);
    expect(p.steps.map((s) => s.capability)).toContain("helpdesk");
    expect(p.steps.map((s) => s.capability)).toContain("payments");
    expect(JSON.stringify(p)).not.toMatch(/zendesk|stripe/i);
  });

  it("clears capabilities outside the list", async () => {
    const p = await generatePlaybook({ goal: "handle refund requests", capabilities: capabilities.slice(0, 1), existingTitles: [] });
    expect(p.steps.filter((s) => s.capability === "payments")).toEqual([]);
  });
});

describe("choosePlaybookTools", () => {
  it("gives each step an action of its own system and access", async () => {
    const steps = [
      { title: "Check the incoming refund ticket", detail: "", capability: "helpdesk", access: "read" as const },
      { title: "Check the payment", detail: "Find the customer's payment", capability: "payments", access: "read" as const },
      { title: "Decide", detail: "", capability: null, access: "none" as const },
      { title: "Issue the refund", detail: "", capability: "payments", access: "write" as const },
    ];
    const tools = await choosePlaybookTools({ steps, toolsByStep: [helpdesk, payments, [], payments] });
    expect(tools[0]).toContain("zendesk.read_ticket");
    expect(tools[1]).toContain("stripe.list_payments");
    expect(tools[1]).not.toContain("stripe.create_refund");
    expect(tools[2]).toEqual([]);
    expect(tools[3]).toEqual(["stripe.create_refund"]);
  });

  it("matches by words when names differ", () => {
    expect(closestTools({ title: "Reply to the customer", detail: "", access: "write" }, helpdesk)).toEqual(["zendesk.send_reply"]);
  });
});
