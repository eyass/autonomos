import { beforeAll, describe, expect, it } from "vitest";
import { ingestSource, searchKnowledge } from "../src";
import { service, signUp, uniqueEmail } from "./helpers";

// Company knowledge against the local database, with mock embeddings (AI_MOCK=1).
const page = (title: string, body: string, links: string[] = []) =>
  `<html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${body} We help people buy and sell good furniture again, with checks on every listing.</p>${links.map((l) => `<a href="${l}">x</a>`).join("")}</main></body></html>`;

describe("company knowledge", () => {
  let org: string;
  let other: Awaited<ReturnType<typeof signUp>>;
  beforeAll(async () => {
    process.env.AI_MOCK = "1";
    const a = await signUp(uniqueEmail("knowledge-a"));
    other = await signUp(uniqueEmail("knowledge-b"));
    const { data } = await a.client.rpc("create_organization", { p_name: "Acme Sofas", p_website: "", p_industry: "Marketplaces", p_employee_count: "", p_country: "", p_description: "" });
    org = data!;
    await other.client.rpc("create_organization", { p_name: "Other", p_website: "", p_industry: "", p_employee_count: "", p_country: "", p_description: "" });
  });

  it("reads pasted text into searchable passages and the brief", async () => {
    const db = service();
    const { data: s } = await db
      .from("knowledge_sources")
      .insert({ organization_id: org, kind: "paste", title: "Refund policy", content: "# Refunds\nRefunds are paid within 14 days of delivery. Contact refunds@acme.test.\n# Shipping\nWe ship sofas within five working days." })
      .select("id")
      .single();
    const r = await ingestSource(db, s!.id);
    expect(r).toMatchObject({ done: true, status: "ready" });

    const hits = await searchKnowledge(db, org, "how many days for a refund");
    expect(hits[0]!.heading).toBe("Refunds");
    expect(hits[0]!.excerpt).toContain("14 days");
    expect(hits[0]!.excerpt).not.toContain("refunds@acme.test");

    const { data: o } = await db.from("organizations").select("company_brief").eq("id", org).single();
    expect(JSON.stringify(o!.company_brief)).toContain("Refunds are paid within 14 days");
  });

  it("reads a whole website breadth first into one source", async () => {
    const db = service();
    const pages: Record<string, string> = {
      "/": page("Acme", "Second-hand sofas, delivered.", ["/about", "/returns", "/login"]),
      "/about": page("About", "Founded in Utrecht in 2015 by two carpenters."),
      "/returns": page("Returns", "Return a sofa within 30 days for a full refund."),
    };
    const fetchImpl = (async (input: string | URL) => {
      const url = new URL(String(input));
      const html = pages[url.pathname];
      return html ? new Response(html, { headers: { "content-type": "text/html" } }) : new Response("no", { status: 404, headers: { "content-type": "text/plain" } });
    }) as typeof fetch;
    const { data: s } = await db.from("knowledge_sources").insert({ organization_id: org, kind: "website", title: "acme.test", url: "https://acme.test/" }).select("id").single();
    const r = await ingestSource(db, s!.id, { allowPrivate: true, fetchImpl });
    expect(r.done).toBe(true);
    const { data: row } = await db.from("knowledge_sources").select("status, pages, summary").eq("id", s!.id).single();
    expect(row).toMatchObject({ status: "ready", pages: 3 });
    const hits = await searchKnowledge(db, org, "return a sofa refund days");
    expect(hits.some((h) => h.url === "https://acme.test/returns")).toBe(true);
  });

  it("keeps passages inside the organisation", async () => {
    const { data } = await other.client.from("knowledge_passages").select("id").eq("organization_id", org);
    expect(data).toEqual([]);
    const { error } = await other.client.from("knowledge_sources").insert({ organization_id: org, kind: "paste", title: "x", content: "y" });
    expect(error).not.toBeNull();
  });
});
