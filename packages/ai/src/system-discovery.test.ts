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

describe("exhaustive discovery", () => {
  it("adds a few likely processes after the evidenced ones, capped and not preselected", async () => {
    process.env.AI_MOCK = "1";
    const { proposeProcessesFromSystems, INFERRED_MAX_CONFIDENCE, DISCOVERY_LIMITS } = await import("./tasks/discovery");
    const r = await proposeProcessesFromSystems({
      company: { name: "Acme", connectedSystems: ["Zendesk", "Gmail"] },
      samples: [tickets, inbox],
      existingProcesses: ["Payroll preparation"],
      rejectedProcesses: ["Month end close", "Order status enquiries"],
    });
    expect(r.processes.length).toBeGreaterThan(5);
    expect(r.processes.length).toBeLessThanOrEqual(DISCOVERY_LIMITS.total);
    // Inferred work is a short tail, never more than the limit, never preselected.
    const inferred = r.processes.filter((p) => p.evidence[0]!.source === "Company profile");
    expect(inferred.length).toBeGreaterThan(0);
    expect(inferred.length).toBeLessThanOrEqual(DISCOVERY_LIMITS.inferred);
    expect(inferred.every((p) => p.confidence <= INFERRED_MAX_CONFIDENCE)).toBe(true);
    expect(r.processes.map((p) => p.title)).not.toContain("Payroll preparation");
    // Rejected processes, and rewordings of them, never come back.
    expect(r.processes.map((p) => p.title)).not.toContain("Month-end close");
    expect(r.processes.map((p) => p.title)).not.toContain("Order status enquiries");
    expect(r.summary).toMatch(/more are likely/);
  });
  it("merges duplicates across the two passes", async () => {
    const { mergeProposals, sameProcess } = await import("./tasks/discovery");
    expect(sameProcess("Refund request handling", "Refund requests")).toBe(true);
    expect(sameProcess("Refund request handling", "Chargeback handling")).toBe(false);
    const base = mockSystemDiscovery([tickets], []).processes[0]!;
    const merged = mergeProposals(
      [],
      [base],
      [
        { ...base, title: "Refund requests", confidence: 0.9 },
        { ...base, title: "Chargeback disputes", confidence: 0.9, evidence: [] },
        { ...base, title: "Stock reorders", confidence: 0.9 },
      ],
    );
    expect(merged.map((p) => p.title)).toEqual([base.title, "Stock reorders"]);
    expect(merged[1]!.confidence).toBe(0.45);
  });
});

describe("per-system discovery", () => {
  it("reads each kind of system through its own playbook", async () => {
    const { playbookFor } = await import("./tasks/discovery");
    expect(playbookFor({ system: "Stripe", itemKind: "payments and refunds" })).toMatch(/failed payments/);
    expect(playbookFor({ system: "Google Calendar", itemKind: "calendar events" })).toMatch(/Recurring meetings/);
    expect(playbookFor({ system: "Gmail", itemKind: "emails" })).toMatch(/inbox/);
    expect(playbookFor({ system: "Acme ERP", itemKind: "records" })).toMatch(/business system/);
  });
  it("takes turns between systems so one busy system does not fill the top of the list", async () => {
    const { mergeProposals } = await import("./tasks/discovery");
    const base = mockSystemDiscovery([tickets], []).processes[0]!;
    const mk = (title: string, system: string, perMonth: number) => ({ ...base, title, primarySystem: system, estimatedOccurrencesPerMonth: perMonth, evidence: [{ source: system, detail: "x" }] });
    const merged = mergeProposals(
      [],
      [
        mk("Supplier invoices", "Gmail", 90),
        mk("Partner onboarding emails", "Gmail", 80),
        mk("Interview scheduling", "Gmail", 70),
        mk("Weekly revenue report", "Stripe", 4),
        mk("Standup follow-up", "Google Calendar", 20),
      ],
      [],
    );
    expect(merged.slice(0, 3).map((p) => p.primarySystem)).toEqual(["Gmail", "Google Calendar", "Stripe"]);
  });
  it("tells people what an agent would do and where the work happens", () => {
    const [p] = mockSystemDiscovery([tickets], []).processes;
    expect(p!.primarySystem).toBe("Zendesk");
    expect(p!.automation).toMatch(/an agent/);
  });
});

describe("combining systems into one process", () => {
  const payments: SystemSample = {
    system: "Stripe",
    itemKind: "payments and refunds",
    summary: "Stripe: 4 refunds",
    periodDays: 20,
    items: [
      { title: "Refund (duplicate)", labels: ["refund"], amount: 20 },
      { title: "Refund (requested by customer)", labels: ["refund"], amount: 35 },
    ],
  };
  it("turns the same work seen in two systems into one end-to-end process, listed first", async () => {
    process.env.AI_MOCK = "1";
    const { proposeProcessesFromSystems } = await import("./tasks/discovery");
    const r = await proposeProcessesFromSystems({ company: { name: "Acme", connectedSystems: ["Zendesk", "Stripe"] }, samples: [tickets, payments], existingProcesses: [] });
    const first = r.processes[0]!;
    expect(first.title).toBe("Refund request handling end to end");
    expect(new Set(first.evidence.map((e) => e.source))).toEqual(new Set(["Zendesk", "Stripe"]));
    expect(first.automation).toMatch(/across/);
    // The single-system versions it replaces are gone.
    expect(r.processes.filter((p) => p.title === "Refund request handling")).toHaveLength(0);
  });
  it("keeps one piece of evidence per system at the top", async () => {
    const { diverseEvidence, absorb } = await import("./tasks/discovery");
    const ev = [1, 2, 3, 4, 5, 6].map((i) => ({ source: "Gmail", detail: `g${i}` }));
    expect(diverseEvidence([...ev, { source: "Stripe", detail: "s1" }]).map((e) => e.source)).toEqual(["Gmail", "Stripe", "Gmail", "Gmail", "Gmail", "Gmail"]);
    const base = mockSystemDiscovery([tickets], []).processes[0]!;
    const kept = absorb(
      [{ ...base, title: "Both", combines: ["A", "B"] }],
      [
        { ...base, title: "A" },
        { ...base, title: "B" },
        { ...base, title: "C" },
      ],
    );
    expect(kept.map((p) => p.title)).toEqual(["Both", "C"]);
  });
});

describe("analyst opportunities", () => {
  it("proposes reviews that end in recommendations for ad accounts and the data warehouse, even with nothing read", async () => {
    process.env.AI_MOCK = "1";
    const { proposeProcessesFromSystems, playbookFor } = await import("./tasks/discovery");
    const r = await proposeProcessesFromSystems({ company: { name: "Acme", connectedSystems: ["Google Ads", "Google BigQuery"] }, samples: [], existingProcesses: [] });
    const titles = r.processes.map((p) => p.title);
    expect(titles).toEqual(expect.arrayContaining(["Weekly Google Ads spend review", "Weekly business review from Google BigQuery"]));
    const ads = r.processes.find((p) => p.title === "Weekly Google Ads spend review")!;
    expect(ads.kind).toBe("improvement");
    expect(ads.automation).toMatch(/email the marketing lead three concrete changes/);
    expect(ads.confidence).toBeGreaterThan(0.45);
    expect(playbookFor({ system: "Google BigQuery", itemKind: "warehouse tables" })).toMatch(/weekly KPI review/);
    expect(playbookFor({ system: "Google Ads", itemKind: "records" })).toMatch(/wasted spend/);
  });
});
