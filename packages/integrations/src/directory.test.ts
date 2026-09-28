import { afterEach, describe, expect, it, vi } from "vitest";
import { POPULAR_TOOLKITS, integrationKeyFor, toolkitFor } from "./directory";
import { genericItem, scanLimitFor } from "./scan";

const toolkits = [
  { slug: "gmail", name: "Gmail", composio_managed_auth_schemes: ["OAUTH2"], meta: { description: "Email", logo: "g.png", categories: [{ name: "communication" }], version: "1" } },
  { slug: "hubspot", name: "HubSpot", composio_managed_auth_schemes: ["OAUTH2"], meta: { description: "CRM", categories: [{ name: "crm" }] } },
  { slug: "shopify", name: "Shopify", composio_managed_auth_schemes: [], meta: { description: "Online store for hubs", categories: [{ name: "e-commerce" }] } },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function withDirectory() {
  process.env.COMPOSIO_API_KEY = "test";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ items: toolkits, next_cursor: null }))),
  );
  return import("./directory");
}

describe("Composio directory", () => {
  it("ranks name matches before description matches", async () => {
    const { searchDirectory } = await withDirectory();
    const r = await searchDirectory("hub");
    expect(r.map((t) => t.slug)).toEqual(["hubspot", "shopify"]);
  });
  it("says which toolkits Composio can sign in to without a custom app", async () => {
    const { searchDirectory } = await withDirectory();
    const [shopify] = await searchDirectory("shopify");
    expect(shopify!.managedAuth).toBe(false);
    const [gmail] = await searchDirectory("gmail");
    expect(gmail).toMatchObject({ managedAuth: true, logo: "g.png", category: "Email & chat", groups: ["communication"] });
  });
  it("tells sign-in, own-key and needs-setup toolkits apart", async () => {
    const { connectKind } = await withDirectory();
    expect(connectKind({ composio_managed_auth_schemes: ["OAUTH2"], auth_schemes: ["OAUTH2"] })).toBe("signin");
    expect(connectKind({ auth_schemes: ["DCR_OAUTH"] })).toBe("signin");
    expect(connectKind({ auth_schemes: ["API_KEY"] })).toBe("key");
    expect(connectKind({ auth_schemes: ["OAUTH2", "BASIC"] })).toBe("key");
    expect(connectKind({ auth_schemes: ["OAUTH2"] })).toBe("setup");
    expect(connectKind({ auth_schemes: ["S2S_OAUTH2"] })).toBe("setup");
  });
  it("plans a connection only through schemes needing nothing registered by us", async () => {
    const { planFor } = await withDirectory();
    const detail = (mode: string, required: unknown[] = []) => ({ mode, fields: { auth_config_creation: { required } } });
    expect(planFor({ slug: "g", name: "G", composio_managed_auth_schemes: ["OAUTH2"] })).toEqual({ managed: true });
    expect(planFor({ slug: "c", name: "C", auth_config_details: [detail("OAUTH2", [{ name: "client_id" }]), detail("API_KEY")] })).toEqual({ managed: false, scheme: "API_KEY" });
    expect(planFor({ slug: "d", name: "D", auth_config_details: [detail("API_KEY"), detail("DCR_OAUTH")] })).toEqual({ managed: false, scheme: "DCR_OAUTH" });
    expect(planFor({ slug: "x", name: "X", auth_config_details: [detail("API_KEY", [{ name: "base_url" }]), detail("OAUTH2", [{ name: "client_id" }])] })).toBeNull();
  });
  it("reads a toolkit's actions from its current version, across pages", async () => {
    process.env.COMPOSIO_API_KEY = "test";
    const urls: string[] = [];
    const pages = [
      { items: [{ slug: "FRESHDESK_GET_TICKETS", version: "20260828_00", tags: ["readOnlyHint"] }], next_cursor: "c2" },
      { items: [{ slug: "FRESHDESK_CREATE_TICKET", version: "20260828_00", tags: [] }], next_cursor: null },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        urls.push(String(url));
        return new Response(JSON.stringify(pages[urls.length - 1]));
      }),
    );
    const { readOnlyTools } = await import("./directory");
    const tools = await readOnlyTools("freshdesk");
    expect(tools.map((t) => [t.slug, t.version])).toEqual([["FRESHDESK_GET_TICKETS", "20260828_00"]]);
    expect(urls).toHaveLength(2);
    expect(urls.every((u) => new URL(u).searchParams.get("toolkit_versions") === "latest")).toBe(true);
    expect(new URL(urls[1]!).searchParams.get("cursor")).toBe("c2");
  });
  it("lists twenty popular systems", () => {
    expect(POPULAR_TOOLKITS).toHaveLength(20);
    expect(POPULAR_TOOLKITS).toEqual(expect.arrayContaining(["gmail", "googlecalendar", "outlook", "facebook", "stripe"]));
  });
  it("replaces connected popular systems with the next most common ones", async () => {
    const { searchDirectory, POPULAR_BACKFILL } = await withDirectory();
    const slugs = [...POPULAR_TOOLKITS, ...POPULAR_BACKFILL];
    toolkits.splice(0, toolkits.length, ...slugs.map((slug) => ({ slug, name: slug, composio_managed_auth_schemes: ["OAUTH2"], meta: { description: "", categories: [{ name: "x" }] } })));
    const all = await searchDirectory("");
    expect(all.map((t) => t.slug)).toEqual([...POPULAR_TOOLKITS]);
    const rest = await searchDirectory("", 30, new Set(["gmail", "stripe"]));
    expect(rest).toHaveLength(20);
    expect(rest.map((t) => t.slug)).not.toContain("gmail");
    expect(rest.map((t) => t.slug)).not.toContain("stripe");
    expect(rest.slice(-2).map((t) => t.slug)).toEqual([POPULAR_BACKFILL[0], POPULAR_BACKFILL[1]]);
  });
  it("filters by business category and lists the best known systems first", async () => {
    const { searchDirectory, directoryGroups } = await withDirectory();
    toolkits.splice(
      0,
      toolkits.length,
      { slug: "freshdesk", name: "Freshdesk", composio_managed_auth_schemes: [], meta: { description: "", categories: [{ name: "customer support" }] } },
      { slug: "zendesk", name: "Zendesk", composio_managed_auth_schemes: ["OAUTH2"], meta: { description: "", categories: [{ name: "crm" }, { name: "customer support" }] } },
      { slug: "xero", name: "Xero", composio_managed_auth_schemes: [], meta: { description: "", categories: [{ name: "accounting" }] } },
    );
    expect((await searchDirectory("", 30, new Set(), "support")).map((t) => t.slug)).toEqual(["zendesk", "freshdesk"]);
    expect((await searchDirectory("", 30, new Set(), "sales")).map((t) => t.slug)).toEqual(["zendesk"]);
    expect((await searchDirectory("fresh", 30, new Set(), "finance")).map((t) => t.slug)).toEqual([]);
    expect(await directoryGroups()).toEqual(
      expect.arrayContaining([
        { key: "support", label: "Customer support", count: 2 },
        { key: "finance", label: "Finance & accounting", count: 1 },
      ]),
    );
  });
  it("maps toolkit slugs to integration keys both ways", () => {
    expect(integrationKeyFor("googledrive")).toBe("google_drive");
    expect(toolkitFor("google_drive")).toBe("googledrive");
    expect(integrationKeyFor("hubspot")).toBe("hubspot");
  });
});

describe("scan limits and the general reader", () => {
  it("reads 30 days for common systems and caps each", () => {
    expect(scanLimitFor("gmail")).toEqual({ days: 30, max: 250 });
    expect(scanLimitFor("google_drive")).toEqual({ days: 30, max: 150 });
    expect(scanLimitFor("stripe")).toEqual({ days: 30, max: 100 });
    expect(scanLimitFor("some_other_tool")).toEqual({ days: 30, max: 50 });
  });
  it("turns an arbitrary record into a redacted work item", () => {
    expect(genericItem({ properties: { dealname: "Renewal for ACME", name: "ignored" }, stage: "negotiation", created_at: "2026-09-20T10:00:00Z" })).toEqual({
      title: "Renewal for ACME",
      date: "2026-09-20T10:00:00.000Z",
      labels: ["negotiation"],
    });
    expect(genericItem({ subject: "Call anna@example.com", status: "open" })!.title).toBe("Call [someone@example.com]");
    expect(genericItem({ id: 1 })).toBeNull();
  });
});

describe("generic readers", () => {
  const tool = (slug: string, properties: Record<string, { type?: string }> = {}) => ({ slug, version: "1", properties, required: [], tags: ["readOnlyHint"] });
  it("skips configuration and deleted records, and falls back to a get of a plural", async () => {
    const { genericCandidates } = await import("./scan");
    const picked = genericCandidates([
      tool("FRESHDESK_LIST_EMAIL_CONFIGS"),
      tool("FRESHDESK_LIST_TICKET_FORMS"),
      tool("ZENDESK_GET_DELETED_TICKETS"),
      tool("FRESHDESK_GET_TICKETS", { per_page: { type: "integer" }, created_since: { type: "string" } }),
    ]).map((r) => [r.slug, r.limitParam, r.since?.param]);
    expect(picked).toEqual([["FRESHDESK_GET_TICKETS", "per_page", "created_since"]]);
  });
  it("ranks a get of a plural after list actions", async () => {
    const { genericCandidates } = await import("./scan");
    expect(genericCandidates([tool("ACME_GET_TICKETS"), tool("ACME_LIST_TICKETS"), tool("ACME_SEARCH_ORDERS")]).map((r) => r.slug)).toEqual([
      "ACME_LIST_TICKETS",
      "ACME_SEARCH_ORDERS",
      "ACME_GET_TICKETS",
    ]);
  });
});
