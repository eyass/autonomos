import { describe, expect, it } from "vitest";
import { mockSystemDiscovery, type SystemSample } from "./tasks/discovery";

const tickets: SystemSample = {
  system: "Zendesk",
  summary: "Zendesk: 6 tickets",
  periodDays: 20,
  items: [
    { title: "Refund for duplicate charge", labels: ["refund"] },
    { title: "Please refund, arrived damaged", labels: ["refund"] },
    { title: "Where is my order?", labels: ["shipping"] },
    { title: "Refund not received", labels: ["refund"] },
    { title: "Tracking number missing", labels: ["shipping"] },
    { title: "Password reset", labels: ["account_access"] },
  ],
};
const inbox: SystemSample = {
  system: "Gmail",
  summary: "Gmail: 3 emails",
  periodDays: 30,
  items: [
    { title: "Invoice INV-1 for September", from: "supplier.example" },
    { title: "Payment reminder INV-0", from: "supplier.example" },
    { title: "New wholesale order #5", from: "partner.example" },
  ],
};

describe("mockSystemDiscovery", () => {
  it("proposes processes with evidence from each system", () => {
    const r = mockSystemDiscovery([tickets, inbox], []);
    const titles = r.processes.map((p) => p.title);
    expect(titles).toEqual(expect.arrayContaining(["Refund request handling", "Order status enquiries", "Supplier invoice processing", "Wholesale order handling"]));
    const refund = r.processes.find((p) => p.title === "Refund request handling")!;
    expect(refund.evidence[0]).toMatchObject({ source: "Zendesk" });
    expect(refund.evidence[0]!.detail).toMatch(/^3 of 6 items/);
    // 3 in 20 days scales to about 5 a month.
    expect(refund.estimatedOccurrencesPerMonth).toBe(5);
  });
  it("skips processes that already exist", () => {
    const r = mockSystemDiscovery([tickets], ["refund request handling"]);
    expect(r.processes.map((p) => p.title)).not.toContain("Refund request handling");
  });
  it("says when nothing stands out", () => {
    const r = mockSystemDiscovery([{ system: "Slack", summary: "", periodDays: 5, items: [{ title: "lunch?" }] }], []);
    expect(r.processes).toHaveLength(0);
    expect(r.summary).toMatch(/No clear recurring work/);
  });
});
