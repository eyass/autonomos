import { describe, expect, it } from "vitest";
import { parse } from "node-html-parser";
import { choosePages, crawlWebsite, detectTools, isPrivateAddress, mailProviderFromMx, normalizeWebsite, organizationFromJsonLd, rankLinks, websiteFromEmail, WebsiteError } from "../src/website";

describe("websiteFromEmail", () => {
  it("derives the company site from a work email", () => {
    expect(websiteFromEmail("eve@acme-furniture.nl")).toBe("https://acme-furniture.nl");
  });
  it("ignores personal and reserved domains", () => {
    expect(websiteFromEmail("eve@gmail.com")).toBeNull();
    expect(websiteFromEmail("eve@example.com")).toBeNull();
    expect(websiteFromEmail("eve@shop.test")).toBeNull();
    expect(websiteFromEmail("not-an-email")).toBeNull();
  });
});

describe("normalizeWebsite", () => {
  it("adds https and drops the fragment", () => {
    expect(normalizeWebsite("acme.com")).toBe("https://acme.com/");
    expect(normalizeWebsite("http://www.acme.com/about#team")).toBe("http://www.acme.com/about");
  });
  it("rejects non-web schemes and nonsense", () => {
    expect(() => normalizeWebsite("ftp://acme.com")).toThrow(WebsiteError);
    expect(() => normalizeWebsite("acme")).toThrow(WebsiteError);
    expect(() => normalizeWebsite("")).toThrow(WebsiteError);
  });
});

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111"])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
  it("treats anything that is not an IP as unsafe", () => {
    expect(isPrivateAddress("localhost")).toBe(true);
  });
});

describe("rankLinks and choosePages", () => {
  const links = [
    { href: "/about-us", text: "About us" },
    { href: "/pricing", text: "Pricing" },
    { href: "/blog/2024/why-we-love-refunds", text: "Why we love refunds" },
    { href: "/privacy", text: "Privacy policy" },
    { href: "https://twitter.com/acme", text: "Twitter" },
    { href: "/careers", text: "Jobs" },
    { href: "/team", text: "Our team" },
    { href: "/help", text: "Help centre" },
    { href: "/files/brochure.pdf", text: "Brochure" },
  ];
  it("keeps same-site pages that describe the company and skips legal, files and other sites", () => {
    const urls = rankLinks("https://acme.com/", links).map((c) => new URL(c.url).pathname);
    expect(urls).toContain("/about-us");
    expect(urls).not.toContain("/privacy");
    expect(urls).not.toContain("/files/brochure.pdf");
    expect(urls.some((u) => u.includes("twitter"))).toBe(false);
  });
  it("prefers one page of each kind before a second about page", () => {
    const chosen = choosePages(rankLinks("https://acme.com/", links), 4);
    expect(new Set(chosen.map((c) => c.kind)).size).toBe(4);
    expect(chosen[0]!.kind).toBe("about");
  });
});

describe("detectTools", () => {
  it("recognises support, CRM and payment tools from page source", () => {
    const html = `<script src="https://static.zdassets.com/ekr/snippet.js"></script><script src="https://js.stripe.com/v3"></script><script src="//js.hs-scripts.com/123.js"></script><link href="https://cdn.shopify.com/x.css">`;
    const { tools, other } = detectTools(html);
    expect(tools.map((t) => t.key).sort()).toEqual(["hubspot", "stripe", "zendesk"]);
    expect(other).toContain("Shopify");
  });
  it("reads the mail provider from MX hosts", () => {
    expect(mailProviderFromMx(["aspmx.l.google.com"])).toBe("google");
    expect(mailProviderFromMx(["acme-nl.mail.protection.outlook.com"])).toBe("microsoft");
    expect(mailProviderFromMx(["mx.example.net"])).toBeNull();
  });
});

describe("organizationFromJsonLd", () => {
  it("reads name, country and employees, including @graph", () => {
    const root = parse(
      `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Acme site"},{"@type":"Organization","name":"Acme BV","address":{"addressCountry":"NL"},"numberOfEmployees":{"value":42}}]}</script>`,
    );
    expect(organizationFromJsonLd(root)).toMatchObject({ name: "Acme BV", country: "NL", employees: 42 });
  });
  it("ignores invalid JSON", () => {
    expect(organizationFromJsonLd(parse(`<script type="application/ld+json">{nope</script>`))).toBeNull();
  });
});

describe("crawlWebsite", () => {
  const site: Record<string, string> = {
    "https://acme.com/": `<html lang="en"><head><title>Acme | Second-hand furniture marketplace</title><meta name="description" content="Buy and sell used furniture."><script src="https://static.zdassets.com/ekr/snippet.js"></script></head><body><nav>Menu</nav><main><h1>Furniture that lasts</h1><p>Acme connects buyers and sellers of used furniture.</p><a href="/about">About</a><a href="/careers">Careers</a><a href="/privacy">Privacy</a></main></body></html>`,
    "https://acme.com/about": `<html><head><title>About Acme</title></head><body><main><p>We are 35 people in Amsterdam.</p></main><script src="https://js.stripe.com/v3"></script></body></html>`,
    "https://acme.com/careers": `<html><head><title>Careers</title></head><body><main><p>Customer support agent (Dutch speaking)</p></main></body></html>`,
  };
  const fakeFetch = (async (input: URL | string) => {
    const url = input.toString();
    if (url === "https://acme.com/" || url === "https://acme.com") {
      return new Response(site["https://acme.com/"], { headers: { "content-type": "text/html" } });
    }
    if (url === "http://acme.com/") return new Response(null, { status: 301, headers: { location: "https://acme.com/" } });
    const body = site[url];
    return body ? new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } }) : new Response("nope", { status: 404 });
  }) as typeof fetch;

  it("reads home plus the pages that matter and detects tools across them", async () => {
    const snap = await crawlWebsite("http://acme.com", { fetchImpl: fakeFetch, allowPrivate: true, resolveMxImpl: async () => [{ exchange: "aspmx.l.google.com" }] });
    expect(snap.url).toBe("https://acme.com/");
    expect(snap.domain).toBe("acme.com");
    expect(snap.description).toBe("Buy and sell used furniture.");
    expect(snap.pages.map((p) => p.kind)).toEqual(["home", "about", "careers"]);
    expect(snap.pages[0]!.text).toContain("Acme connects buyers and sellers");
    expect(snap.pages[0]!.text).not.toContain("<script");
    expect(snap.detectedTools.map((t) => t.key).sort()).toEqual(["gmail", "stripe", "zendesk"]);
  });

  it("refuses private addresses unless explicitly allowed", async () => {
    await expect(crawlWebsite("http://127.0.0.1:3999/site", { fetchImpl: fakeFetch })).rejects.toThrow(/not publicly reachable/);
  });

  it("refuses a redirect into a private address", async () => {
    const redirecting = (async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } })) as unknown as typeof fetch;
    await expect(crawlWebsite("https://93.184.216.34/", { fetchImpl: redirecting })).rejects.toThrow(/not publicly reachable/);
  });
});
