import { describe, expect, it } from "vitest";
import type { SandboxRecord, SandboxStore } from "./providers";
import { sandboxHistory } from "./sandbox-history";
import { describeScan, redact, scanSystem } from "./scan";

function memoryStore(records: Array<{ system: string; kind: string; record: SandboxRecord }>): SandboxStore {
  const rows = [...records];
  return {
    get: async (system, kind, id) => rows.find((r) => r.system === system && r.kind === kind && r.record.id === id)?.record ?? null,
    list: async (system, kind) => rows.filter((r) => r.system === system && r.kind === kind).map((r) => r.record),
    put: async (system, kind, record) => void rows.push({ system, kind, record }),
  };
}

const now = new Date("2026-09-26T12:00:00Z");
const sandbox = (system: string) => memoryStore(sandboxHistory(system, now).map((h) => ({ system, ...h })));
const ctx = (system: string) => ({ organizationId: "org", connection: { integration: system, provider: "sandbox" as const, externalAccountId: null }, sandbox: sandbox(system), now });

describe("redact", () => {
  it("keeps only the domain of email addresses", () => {
    expect(redact("Mail anna.devries@example.com today")).toBe("Mail [someone@example.com] today");
  });
  it("removes phone numbers and IBANs", () => {
    expect(redact("Call +31 6 1234 5678 or pay NL91ABNA0417164300")).toBe("Call [number] or pay [iban]");
  });
  it("shortens long text", () => {
    expect(redact("x".repeat(500), 50)).toHaveLength(50);
  });
});

describe("scanSystem on sandbox data", () => {
  it("reads Zendesk tickets with tags and a period", async () => {
    const scan = await scanSystem("zendesk", ctx("zendesk"));
    expect(scan.sampled).toBe(15);
    expect(scan.itemKind).toBe("tickets");
    expect(scan.periodDays).toBeGreaterThanOrEqual(26);
    expect(String(scan.stats.top_tags)).toMatch(/refund \(\d+\)/);
    expect(JSON.stringify(scan.items)).not.toMatch(/customer\d+@example\.com/);
  });
  it("reads Gmail messages and keeps sender domains, not addresses", async () => {
    const scan = await scanSystem("gmail", ctx("gmail"));
    expect(scan.sampled).toBe(12);
    expect(scan.items.every((i) => !i.from || !i.from.includes("@"))).toBe(true);
    expect(String(scan.stats.top_sender_domains)).toContain("packaging-supplier.example");
  });
  it("reads Slack messages by channel", async () => {
    const scan = await scanSystem("slack", ctx("slack"));
    expect(scan.sampled).toBe(10);
    expect(String(scan.stats.channels)).toContain("#support");
  });
  it("says when a system cannot be read yet", async () => {
    const scan = await scanSystem("hubspot", ctx("hubspot"));
    expect(scan.unsupported).toBeTruthy();
    expect(describeScan(scan, "HubSpot")).toContain("not read");
  });
  it("describes a scan in one line with counts and examples", async () => {
    const line = describeScan(await scanSystem("zendesk", ctx("zendesk")), "Zendesk");
    expect(line).toMatch(/^Zendesk \(sandbox\): 15 tickets over \d+ days/);
    expect(line).toContain("Examples:");
  });
});

describe("lookback window", () => {
  it("leaves out records older than 30 days", async () => {
    const store = memoryStore([
      { system: "stripe", kind: "payment", record: { id: "p1", amount: 10, created_at: new Date(now.getTime() - 5 * 86_400_000).toISOString() } },
      { system: "stripe", kind: "payment", record: { id: "p2", amount: 20, created_at: new Date(now.getTime() - 45 * 86_400_000).toISOString() } },
    ]);
    const scan = await scanSystem("stripe", { organizationId: "org", connection: { integration: "stripe", provider: "sandbox", externalAccountId: null }, sandbox: store, now });
    expect(scan.stats.payments).toBe(1);
  });
});
