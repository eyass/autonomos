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
    expect(gmail).toMatchObject({ managedAuth: true, logo: "g.png", category: "Communication" });
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
