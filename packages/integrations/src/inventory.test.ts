import { beforeEach, describe, expect, it, vi } from "vitest";

// The inventory and the readers that use it, with Composio replaced by a fake.
const calls: Array<{ slug: string; args: Record<string, unknown> }> = [];
let respond: (slug: string, args: Record<string, unknown>) => unknown = () => ({});
let catalogue: Array<{ slug: string; version: string | null; properties: Record<string, { type?: string }>; required: string[]; tags: string[] }> = [];
vi.mock("./providers", () => ({
  getComposio: () => ({
    tools: {
      execute: async (slug: string, o: { arguments: Record<string, unknown> }) => {
        calls.push({ slug, args: o.arguments });
        const data = respond(slug, o.arguments);
        return data instanceof Error ? { successful: false, error: data.message } : { successful: true, data };
      },
    },
  }),
}));
vi.mock("./directory", async (orig) => ({ ...(await orig<typeof import("./directory")>()), readOnlyTools: async () => catalogue }));

const { inventorySystem, describeInventory } = await import("./inventory");
const { scanSystem } = await import("./scan");
const now = new Date("2026-09-26T12:00:00Z");
const ctx = (integration: string, inventory?: unknown) => ({
  organizationId: "org",
  connection: { integration, provider: "composio" as const, externalAccountId: "ca_1" },
  sandbox: {} as never,
  now,
  inventory: inventory as never,
});

beforeEach(() => {
  calls.length = 0;
  catalogue = [];
});

describe("BigQuery inventory", () => {
  const warehouse = (slug: string, args: Record<string, unknown>) => {
    if (slug === "GOOGLEBIGQUERY_LIST_PROJECTS") return { projects: [{ id: "shop-prod", projectReference: { projectId: "shop-prod" } }] };
    if (slug === "GOOGLEBIGQUERY_LIST_DATASETS") return { datasets: [{ datasetReference: { datasetId: "marketplace", projectId: "shop-prod" }, location: "europe-west1" }] };
    const q = String(args.query);
    if (q.includes("TABLE_STORAGE")) return { rows: [{ table_schema: "marketplace", table_name: "orders", total_rows: 120000, storage_last_modified_time: "2026-09-25T00:00:00Z" }] };
    if (q.includes("COLUMNS")) return { rows: [{ table_schema: "marketplace", table_name: "orders", columns: "order_id INT64, amount NUMERIC, created_at TIMESTAMP" }] };
    return {};
  };

  it("finds projects, dataset locations and table schemas once", async () => {
    respond = warehouse;
    const inv = await inventorySystem("googlebigquery", ctx("googlebigquery"));
    expect(inv.summary).toBe("1 project, 1 dataset, 1 table");
    const table = inv.resources.find((r) => r.kind === "table")!;
    expect(table).toMatchObject({ name: "marketplace.orders", parent: "shop-prod", location: "europe-west1", count: 120000 });
    expect(table.fields).toContain("amount NUMERIC");
    const queries = calls.filter((c) => c.slug === "GOOGLEBIGQUERY_QUERY");
    expect(queries.every((c) => c.args.project_id === "shop-prod" && c.args.location === "europe-west1" && String(c.args.query).includes("`region-europe-west1`"))).toBe(true);
    expect(describeInventory(inv, "BigQuery")).toContain("marketplace.orders (120,000 rows; order_id INT64");
  });

  it("scans from the inventory without listing projects or columns again", async () => {
    respond = warehouse;
    const inv = await inventorySystem("googlebigquery", ctx("googlebigquery"));
    calls.length = 0;
    const scan = await scanSystem("googlebigquery", ctx("googlebigquery", inv));
    expect(calls.map((c) => c.slug)).toEqual(["GOOGLEBIGQUERY_QUERY"]);
    expect(String(calls[0]!.args.query)).toContain("TABLE_STORAGE");
    expect(scan.items[0]!.detail).toContain("amount NUMERIC");
  });
});

describe("Google Ads", () => {
  it("keeps the ad accounts under a manager account and reports campaign spend", async () => {
    respond = (slug, args) => {
      if (slug === "GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS") return { resourceNames: ["customers/111"] };
      if (slug === "GOOGLEADS_LIST_SUB_ACCOUNTS") return { sub_accounts: [{ customer_id: "222", descriptive_name: "Shop NL", currency_code: "EUR", manager: false }] };
      const q = String(args.query);
      if (q.includes("FROM customer")) return { results: [{ customer: { id: "111", descriptiveName: "Agency MCC", manager: true } }] };
      if (q.includes("FROM campaign") && args.customer_id === "222")
        return {
          results: [
            { campaign: { name: "Brand", status: "ENABLED", advertisingChannelType: "SEARCH" }, metrics: { costMicros: "250000000", clicks: "900", conversions: 25 } },
            { campaign: { name: "Generic", status: "ENABLED" }, metrics: { costMicros: "750000000", clicks: "1200", conversions: 5 } },
          ],
        };
      return {};
    };
    const inv = await inventorySystem("googleads", ctx("googleads"));
    expect(inv.resources.filter((r) => r.kind === "ad account").map((r) => r.id)).toEqual(["222"]);
    calls.length = 0;
    const scan = await scanSystem("googleads", ctx("googleads", inv));
    expect(calls.map((c) => c.args.customer_id)).toEqual(["222"]);
    expect(scan.itemKind).toBe("ad campaigns");
    expect(scan.stats.spend_last_30_days).toBe("1,000.00 EUR");
    expect(scan.items[1]!.detail).toContain("cost per conversion 150.00");
  });
});

describe("general reader", () => {
  it("records which read actions work and reuses them without the catalogue", async () => {
    catalogue = [
      { slug: "TODOIST_GET_ALL_COMMENTS", version: null, properties: { task_id: {}, project_id: {} }, required: [], tags: ["readOnlyHint"] },
      { slug: "TODOIST_GET_ALL_TASKS", version: "1", properties: { limit: { type: "integer" } }, required: [], tags: ["readOnlyHint"] },
    ];
    respond = (slug) =>
      slug === "TODOIST_GET_ALL_COMMENTS"
        ? new Error("Either task_id or project_id must be provided")
        : { tasks: [{ content: "Pay invoice", title: "Pay invoice", created_at: "2026-09-20T00:00:00Z", priority: 2 }] };
    const inv = await inventorySystem("todoist", ctx("todoist"));
    expect(inv.readers.map((r) => r.slug)).toEqual(["TODOIST_GET_ALL_TASKS"]);
    expect(inv.readers[0]!.fields).toContain("priority");
    catalogue = [];
    calls.length = 0;
    const scan = await scanSystem("todoist", ctx("todoist", inv));
    expect(calls.map((c) => c.slug)).toEqual(["TODOIST_GET_ALL_TASKS"]);
    expect(scan.items[0]!.title).toBe("Pay invoice");
  });
});
