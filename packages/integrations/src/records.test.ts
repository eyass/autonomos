import { describe, expect, it, vi } from "vitest";

const calls: Array<{ slug: string; args: Record<string, unknown> }> = [];
vi.mock("./providers", async (orig) => ({
  ...(await orig<typeof import("./providers")>()),
  getComposio: () => ({
    tools: {
      execute: async (slug: string, o: { arguments: Record<string, unknown> }) => {
        calls.push({ slug, args: o.arguments });
        if (slug === "FRESHDESK_GET_TICKETS")
          return {
            successful: true,
            data: [
              { id: 101, subject: "Puppy never arrived", description_text: "<p>Paid on 2 Sep</p>", status: 2, created_at: "2026-09-30T09:00:00Z", nested: { a: 1 } },
              { id: 102, subject: "Refund please", status: 2, created_at: "2026-10-01T08:00:00Z" },
            ],
          };
        return { successful: true, data: {} };
      },
    },
  }),
}));

const { compactRecord, kindOf, recentRecords, recordInput, toRecentRecord } = await import("./records");
const ctx = (provider: "composio" | "sandbox", sandboxRows: unknown[] = []) => ({
  organizationId: "org",
  connection: { integration: "freshdesk", provider, externalAccountId: "ca_1" },
  sandbox: { get: async () => null, list: async () => sandboxRows, put: async () => {} } as never,
});

describe("recent records", () => {
  it("reads a known helpdesk newest first, with ids, titles and dates", async () => {
    const r = await recentRecords("freshdesk", ctx("composio"));
    expect(calls[0]).toEqual({ slug: "FRESHDESK_GET_TICKETS", args: { per_page: 20 } });
    expect(r.records.map((x) => x.id)).toEqual(["102", "101"]);
    expect(r.records[1]).toMatchObject({ kind: "ticket", title: "Puppy never arrived", date: "2026-09-30T09:00:00.000Z" });
    // Plain fields only, HTML removed.
    expect(r.records[1]!.record).toMatchObject({ id: 101, description_text: "Paid on 2 Sep" });
    expect(r.records[1]!.record.nested).toBeUndefined();
  });

  it("gives a run the record under its own kind and as record_id", () => {
    const rec = toRecentRecord({ id: "7", subject: "Hello", created_at: "2026-10-01T00:00:00Z" }, "ticket")!;
    expect(recordInput("freshdesk", rec)).toMatchObject({ source: "freshdesk", record_kind: "ticket", record_id: "7", ticket_id: "7", title: "Hello" });
  });

  it("never offers sandbox tickets a test run created", async () => {
    const r = await recentRecords("zendesk", {
      ...ctx("sandbox", [
        { id: "1", subject: "Real" },
        { id: "2", subject: "From a test", test: true },
      ]),
      connection: { integration: "zendesk", provider: "sandbox", externalAccountId: null },
    });
    expect(r.records.map((x) => x.id)).toEqual(["1"]);
  });

  it("names record kinds from the read action", () => {
    expect(kindOf("HELPSCOUT_LIST_CONVERSATIONS")).toBe("conversation");
    expect(kindOf("PIPEDRIVE_GET_ALL_DEALS")).toBe("deal");
    expect(kindOf("ACME_LIST_THINGS")).toBe("record");
    expect(toRecentRecord({ subject: "no id" }, "ticket")).toBeNull();
    expect(Object.keys(compactRecord(Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}`, i]))))).toHaveLength(30);
  });
});
