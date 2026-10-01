import { describe, expect, it } from "vitest";
import { helpCentreCandidates, newSiteState, planUrl, readSite, templateKey, type SitePage } from "../src/site-reader";

const page = (title: string, body: string, links: string[] = []) =>
  `<html lang="en"><head><title>${title}</title></head><body><nav><a href="/login">Log in</a></nav><main><h1>${title}</h1><p>${body} ${"Useful words about how we work. ".repeat(4)}</p>${links.map((l) => `<a href="${l}">${l}</a>`).join("")}</main><footer>Footer</footer></body></html>`;

// A small fake website: path -> response.
function site(pages: Record<string, string>, extra: Record<string, { body: string; type: string }> = {}) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const special = extra[url.pathname];
    if (special) return new Response(special.body, { status: 200, headers: { "content-type": special.type } });
    const html = pages[url.pathname];
    if (!html) return new Response("missing", { status: 404, headers: { "content-type": "text/html" } });
    return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const opts = (fetchImpl: typeof fetch, extra: Partial<Parameters<typeof readSite>[1]> = {}) => ({
  fetch: { timeoutMs: 2000, allowPrivate: true, fetchImpl },
  deadline: Date.now() + 20_000,
  onPage: () => undefined,
  ...extra,
});

describe("planUrl", () => {
  const base = "https://shop.example";
  it("skips account, cart, search and asset pages", () => {
    for (const p of ["/login", "/account/orders", "/cart", "/checkout/step-1", "/search?q=sofa", "/tag/red", "/page/3", "/logo.png", "/brochure.zip"]) {
      expect(planUrl(new URL(p, base), "website"), p).toHaveProperty("skip");
    }
  });
  it("scores help, policy and pricing pages above ordinary pages", () => {
    const score = (p: string) => (planUrl(new URL(p, base), "website") as { score: number }).score;
    expect(score("/returns-policy")).toBeGreaterThan(score("/team-offsite-2023"));
    expect(score("/pricing")).toBeGreaterThan(score("/press"));
  });
});

describe("templateKey", () => {
  it("collapses ids and numbered slugs", () => {
    expect(templateKey(new URL("https://x.test/listings/123"))).toBe("/listings/*");
    expect(templateKey(new URL("https://x.test/product/blue-sofa-42"))).toBe("/product/*");
    expect(templateKey(new URL("https://x.test/blog/2024/05/our-news"))).toBe("/blog/*/*/our-news");
    expect(templateKey(new URL("https://x.test/about"))).toBe("/about");
  });
});

describe("readSite", () => {
  it("reads every level-1 page before going deeper", async () => {
    const { fetchImpl } = site({
      "/": page("Home", "We sell sofas.", ["/about", "/pricing", "/faq"]),
      "/about": page("About", "Founded in 2010.", ["/about/team"]),
      "/pricing": page("Pricing", "Plans and prices.", []),
      "/faq": page("FAQ", "Questions.", []),
      "/about/team": page("Team", "Our team.", []),
    });
    const read: SitePage[] = [];
    const state = await readSite(newSiteState("https://shop.example/", "website"), opts(fetchImpl, { onPage: (p) => void read.push(p) }));
    const order = read.map((p) => new URL(p.url).pathname);
    expect(order.indexOf("/about/team")).toBeGreaterThan(Math.max(order.indexOf("/about"), order.indexOf("/pricing"), order.indexOf("/faq")));
    expect(state.done).toBe(true);
    expect(state.counts.read).toBe(5);
  });

  it("never fetches login or cart pages and keeps headings", async () => {
    const { fetchImpl, calls } = site({ "/": page("Home", "Hello.", ["/login", "/cart", "/returns"]), "/returns": page("Returns", "14 days.", []) });
    const read: SitePage[] = [];
    await readSite(newSiteState("https://shop.example/", "website"), opts(fetchImpl, { onPage: (p) => void read.push(p) }));
    expect(calls).not.toContain("/login");
    expect(calls).not.toContain("/cart");
    expect(read.find((p) => p.url.endsWith("/returns"))!.text).toContain("# Returns");
    expect(read[0]!.text).not.toContain("Footer");
  });

  it("samples large repeated sections instead of reading them all", async () => {
    const listings = Array.from({ length: 200 }, (_, i) => `/listings/${i + 1}`);
    const pages: Record<string, string> = { "/": page("Home", "Marketplace.", ["/listings", ...listings]), "/listings": page("All listings", "Browse.", []) };
    for (const l of listings) pages[l] = page(`Listing ${l}`, `A sofa ${l}.`);
    const { fetchImpl } = site(pages);
    const state = await readSite(newSiteState("https://shop.example/", "website"), opts(fetchImpl));
    expect(state.templates["/listings/*"]!.found).toBe(200);
    expect(state.templates["/listings/*"]!.read).toBe(10);
    expect(state.counts.read).toBe(12);
  });

  it("respects robots.txt and reads the sitemap", async () => {
    const { fetchImpl, calls } = site(
      { "/": page("Home", "Hi.", []), "/guides/setup": page("Setup guide", "How to set up."), "/private/x": page("Private", "No.") },
      {
        "/robots.txt": { body: "User-agent: *\nDisallow: /private\nSitemap: https://shop.example/sitemap.xml", type: "text/plain" },
        "/sitemap.xml": { body: "<urlset><url><loc>https://shop.example/guides/setup</loc></url><url><loc>https://shop.example/private/x</loc></url></urlset>", type: "application/xml" },
      },
    );
    const state = await readSite(newSiteState("https://shop.example/", "website"), opts(fetchImpl));
    expect(calls).toContain("/guides/setup");
    expect(calls).not.toContain("/private/x");
    expect(state.counts.read).toBe(2);
  });

  it("resumes from saved state without reading pages twice", async () => {
    const links = Array.from({ length: 12 }, (_, i) => `/page-${i}`);
    const pages: Record<string, string> = { "/": page("Home", "Hi.", links) };
    for (const l of links) pages[l] = page(l, `Text ${l}.`);
    const { fetchImpl, calls } = site(pages);
    const first = await readSite(newSiteState("https://shop.example/", "website"), opts(fetchImpl, { maxPagesThisRound: 5 }));
    expect(first.done).toBe(false);
    const second = await readSite(JSON.parse(JSON.stringify(first)), opts(fetchImpl));
    expect(second.done).toBe(true);
    expect(second.counts.read).toBe(13);
    const pageCalls = calls.filter((c) => c.startsWith("/page-"));
    expect(new Set(pageCalls).size).toBe(pageCalls.length);
  });
});

describe("helpCentreCandidates", () => {
  it("finds help paths, help subdomains and hosted help centres", () => {
    const found = helpCentreCandidates("https://shop.example/", [
      "https://shop.example/help",
      "https://support.shop.example/",
      "https://shopexample.zendesk.com/hc/en-us",
      "https://shop.example/about",
    ]);
    expect(found).toEqual(["https://shop.example/help", "https://support.shop.example/", "https://shopexample.zendesk.com/hc/en-us"]);
  });
});
