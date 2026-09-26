// Company website reader for agentic onboarding.
//
// Reads a handful of pages that say the most about a company (home, about, pricing,
// product, careers, support, integrations), its structured data (JSON-LD), and which
// tools it runs (script signatures on the pages and the domain's MX records). The
// result is evidence for the company profile model, not the profile itself.
//
// Security: every URL, including each redirect hop, must resolve to a public address.
// Private, loopback, link-local and metadata ranges are refused unless `allowPrivate`
// is set (only for the local end-to-end test site). Responses are capped in size and time.
import { lookup, resolveMx } from "node:dns/promises";
import { isIP } from "node:net";
import { parse, type HTMLElement } from "node-html-parser";

export type DetectedTool = { key: string; name: string; evidence: string };

export type WebsitePage = { url: string; kind: string; title: string; text: string };

export type OrganizationData = {
  name?: string;
  description?: string;
  country?: string;
  employees?: number;
  foundingDate?: string;
  sameAs?: string[];
};

export type WebsiteSnapshot = {
  url: string;
  domain: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  language: string | null;
  organization: OrganizationData | null;
  pages: WebsitePage[];
  detectedTools: DetectedTool[];
  otherTechnology: string[];
  mailProvider: "google" | "microsoft" | null;
};

export type CrawlOptions = {
  maxPages?: number;
  timeoutMs?: number;
  allowPrivate?: boolean;
  fetchImpl?: typeof fetch;
  resolveMxImpl?: (domain: string) => Promise<Array<{ exchange: string }>>;
};

// ---------------------------------------------------------------------------
// Website from an email address
// ---------------------------------------------------------------------------

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "gmx.de",
  "web.de",
  "mail.com",
  "yandex.com",
  "yandex.ru",
  "zoho.com",
  "hey.com",
  "fastmail.com",
  "tutanota.com",
  "hotmail.co.uk",
  "yahoo.co.uk",
  "live.nl",
  "hotmail.nl",
  "ziggo.nl",
  "kpnmail.nl",
  "planet.nl",
  "t-online.de",
  "orange.fr",
  "free.fr",
  "laposte.net",
  "libero.it",
  "qq.com",
  "163.com",
]);

// RFC 2606 / 6761 names that never belong to a real company.
const RESERVED_DOMAIN = /(^|\.)(example\.(com|net|org)|test|example|invalid|localhost|local)$/i;

/** The company website implied by a work email, or null for personal and reserved domains. */
export function websiteFromEmail(email: string): string | null {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain || !domain.includes(".")) return null;
  if (PERSONAL_EMAIL_DOMAINS.has(domain) || RESERVED_DOMAIN.test(domain)) return null;
  return `https://${domain}`;
}

/** Accepts "acme.com", "www.acme.com/about" or a full URL; returns an absolute http(s) URL. */
export function normalizeWebsite(input: string): string {
  const raw = input.trim();
  if (!raw) throw new WebsiteError("Enter your company website");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new WebsiteError("That does not look like a website address");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new WebsiteError("Only http and https websites can be read");
  if (!url.hostname.includes(".") && !isIP(url.hostname) && url.hostname !== "localhost") throw new WebsiteError("That does not look like a website address");
  url.hash = "";
  return url.toString();
}

export class WebsiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebsiteError";
  }
}

// ---------------------------------------------------------------------------
// Address safety
// ---------------------------------------------------------------------------

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

const PRIVATE_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/** True for loopback, private, link-local, carrier-grade NAT, documentation, multicast and reserved ranges. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const n = ipv4ToInt(address);
    return PRIVATE_V4.some(([base, bits]) => n >>> (32 - bits) === ipv4ToInt(base) >>> (32 - bits));
  }
  if (version === 6) {
    const a = address.toLowerCase();
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return a === "::" || a === "::1" || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || a.startsWith("ff");
  }
  return true;
}

async function assertPublicUrl(url: URL, allowPrivate: boolean) {
  if (allowPrivate) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new WebsiteError(`Could not find ${host}`);
  if (addresses.some(isPrivateAddress)) throw new WebsiteError("That website address is not publicly reachable");
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const MAX_BYTES = 1_500_000;
const USER_AGENT = "AutonomOS-Onboarding/1.0 (+company profile; reads a few public pages once)";

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

async function fetchHtml(start: string, opts: Required<Pick<CrawlOptions, "timeoutMs" | "allowPrivate">> & { fetchImpl: typeof fetch }) {
  let url = new URL(start);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicUrl(url, opts.allowPrivate);
    const res = await opts.fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs),
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new WebsiteError(`${url.hostname} redirected without a location`);
      url = new URL(location, url);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new WebsiteError("Redirected to an unsupported address");
      continue;
    }
    if (!res.ok) throw new WebsiteError(`${url.hostname} answered with status ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/html/i.test(type)) throw new WebsiteError(`${url.pathname} is not a web page`);
    return { url: url.toString(), html: await readCapped(res) };
  }
  throw new WebsiteError("Too many redirects");
}

// ---------------------------------------------------------------------------
// Choosing pages
// ---------------------------------------------------------------------------

const PAGE_KINDS: Array<{ kind: string; pattern: RegExp; weight: number }> = [
  { kind: "about", pattern: /about|over-?ons|company|who-we-are|our-story|team|ueber-uns|a-propos|quienes/, weight: 10 },
  { kind: "product", pattern: /product|features|solutions|platform|services|diensten|how-it-works|what-we-do/, weight: 8 },
  { kind: "pricing", pattern: /pricing|plans|prijzen|tarieven|preise/, weight: 7 },
  { kind: "customers", pattern: /customers|case-stud|clients|klanten|testimonials|stories/, weight: 5 },
  { kind: "careers", pattern: /careers|jobs|vacatures|werken-bij|join-us|hiring|karriere/, weight: 6 },
  { kind: "support", pattern: /support|help|faq|contact|klantenservice|service/, weight: 6 },
  { kind: "integrations", pattern: /integrations|partners|marketplace\/apps|apps|ecosystem/, weight: 5 },
];
const SKIP = /privacy|terms|cookie|legal|disclaimer|login|log-in|sign-?in|sign-?up|register|cart|checkout|account|\.(pdf|jpe?g|png|gif|svg|webp|zip|mp4|xml)$/i;

export type LinkCandidate = { url: string; kind: string; score: number };

/** Ranks same-site links by how much they are likely to say about the company. */
export function rankLinks(baseUrl: string, links: Array<{ href: string; text: string }>): LinkCandidate[] {
  const base = new URL(baseUrl);
  const site = base.hostname.replace(/^www\./, "");
  const best = new Map<string, LinkCandidate>();
  for (const link of links) {
    let u: URL;
    try {
      u = new URL(link.href, base);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    if (u.hostname.replace(/^www\./, "") !== site) continue;
    u.hash = "";
    u.search = "";
    const path = u.pathname.toLowerCase();
    if (path === "/" || path === base.pathname.toLowerCase() || SKIP.test(path)) continue;
    const haystack = `${path} ${link.text.toLowerCase()}`;
    const depth = path.split("/").filter(Boolean).length;
    for (const k of PAGE_KINDS) {
      if (!k.pattern.test(haystack)) continue;
      const score = k.weight - Math.max(0, depth - 1) * 2 - (/\/(blog|news|nieuws|articles?)\//.test(path) ? 6 : 0);
      const key = u.toString();
      const prev = best.get(key);
      if (!prev || prev.score < score) best.set(key, { url: key, kind: k.kind, score });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** One page per kind first (breadth over depth), then the next best until `max`. */
export function choosePages(candidates: LinkCandidate[], max: number): LinkCandidate[] {
  const chosen: LinkCandidate[] = [];
  const kinds = new Set<string>();
  for (const c of candidates) {
    if (chosen.length >= max) break;
    if (c.score <= 0 || kinds.has(c.kind)) continue;
    kinds.add(c.kind);
    chosen.push(c);
  }
  for (const c of candidates) {
    if (chosen.length >= max) break;
    if (c.score > 0 && !chosen.includes(c)) chosen.push(c);
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Reading pages
// ---------------------------------------------------------------------------

const NOISE = "script, style, noscript, svg, iframe, template, form, button, [aria-hidden=true]";

export function pageText(root: HTMLElement, maxChars = 6000): string {
  const clone = parse(root.toString());
  clone.querySelectorAll(NOISE).forEach((n) => n.remove());
  const main = clone.querySelector("main") ?? clone.querySelector("body") ?? clone;
  return main.structuredText
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 2)
    .filter((l, i, all) => all.indexOf(l) === i)
    .join("\n")
    .slice(0, maxChars);
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

const ORG_TYPES = /Organization|Corporation|LocalBusiness|OnlineStore|OnlineBusiness|Store|ProfessionalService|SoftwareApplication|WebSite/;

/** Organisation facts from JSON-LD (schema.org), when the site publishes them. */
export function organizationFromJsonLd(root: HTMLElement): OrganizationData | null {
  const found: OrganizationData = {};
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.text);
    } catch {
      continue;
    }
    const nodes = asArray(data as Record<string, unknown> | Record<string, unknown>[]).flatMap((n) => [n, ...asArray((n as { "@graph"?: Record<string, unknown>[] })["@graph"])]);
    for (const node of nodes) {
      const type = asArray(node["@type"] as string | string[]).join(" ");
      if (!ORG_TYPES.test(type)) continue;
      const isWebsite = /^WebSite$/.test(type);
      if (typeof node.name === "string" && (!found.name || !isWebsite)) found.name = node.name;
      if (typeof node.description === "string" && !found.description) found.description = node.description;
      if (typeof node.foundingDate === "string") found.foundingDate = node.foundingDate;
      const address = asArray(node.address as Record<string, unknown> | undefined)[0] as Record<string, unknown> | undefined;
      const country = address?.addressCountry;
      if (typeof country === "string") found.country = country;
      else if (country && typeof (country as { name?: string }).name === "string") found.country = (country as { name: string }).name;
      const employees = node.numberOfEmployees as number | { value?: number; maxValue?: number; minValue?: number } | undefined;
      const count = typeof employees === "number" ? employees : (employees?.value ?? employees?.maxValue ?? employees?.minValue);
      if (typeof count === "number" && Number.isFinite(count)) found.employees = count;
      const sameAs = asArray(node.sameAs as string | string[]).filter((s) => typeof s === "string");
      if (sameAs.length) found.sameAs = sameAs.slice(0, 8);
    }
  }
  return Object.keys(found).length ? found : null;
}

// ---------------------------------------------------------------------------
// Tool detection
// ---------------------------------------------------------------------------

// Keys match the integrations catalog.
const TOOL_SIGNATURES: Array<{ key: string; name: string; pattern: RegExp; evidence: string }> = [
  { key: "zendesk", name: "Zendesk", pattern: /static\.zdassets\.com|ekr\.zdassets\.com|\.zendesk\.com|zopim/i, evidence: "Zendesk widget or help centre on the website" },
  { key: "intercom", name: "Intercom", pattern: /widget\.intercom\.io|js\.intercomcdn\.com|intercomSettings/i, evidence: "Intercom messenger on the website" },
  { key: "hubspot", name: "HubSpot", pattern: /js\.hs-scripts\.com|js\.hsforms\.net|js\.hs-analytics\.net|hbspt\.forms/i, evidence: "HubSpot tracking or forms on the website" },
  { key: "salesforce", name: "Salesforce", pattern: /pardot\.com|pi\.pardot|force\.com|salesforce-sites|webto\.salesforce\.com/i, evidence: "Salesforce or Pardot forms on the website" },
  { key: "stripe", name: "Stripe", pattern: /js\.stripe\.com|checkout\.stripe\.com|buy\.stripe\.com|billing\.stripe\.com/i, evidence: "Stripe checkout on the website" },
  { key: "slack", name: "Slack", pattern: /join\.slack\.com|slack\.com\/oauth|slack\.com\/apps/i, evidence: "Slack community or app links on the website" },
  { key: "notion", name: "Notion", pattern: /\.notion\.site|notion\.so\//i, evidence: "Pages hosted on Notion" },
];

const OTHER_TECH: Array<{ name: string; pattern: RegExp }> = [
  { name: "Shopify", pattern: /cdn\.shopify\.com|myshopify\.com/i },
  { name: "WooCommerce", pattern: /woocommerce/i },
  { name: "WordPress", pattern: /wp-content|wp-includes/i },
  { name: "Webflow", pattern: /webflow\.(com|io)|data-wf-site/i },
  { name: "Freshdesk", pattern: /freshdesk\.com|freshchat/i },
  { name: "Gorgias", pattern: /gorgias/i },
  { name: "Klaviyo", pattern: /klaviyo/i },
  { name: "Mailchimp", pattern: /mailchimp|list-manage\.com/i },
  { name: "Google Analytics", pattern: /googletagmanager\.com|google-analytics\.com/i },
  { name: "Segment", pattern: /cdn\.segment\.com/i },
  { name: "Calendly", pattern: /calendly\.com/i },
  { name: "Typeform", pattern: /typeform\.com/i },
  { name: "Adyen", pattern: /adyen/i },
  { name: "Mollie", pattern: /mollie\.com/i },
  { name: "PayPal", pattern: /paypal\.com\/sdk|paypalobjects/i },
];

export function detectTools(html: string): { tools: DetectedTool[]; other: string[] } {
  const tools = TOOL_SIGNATURES.filter((t) => t.pattern.test(html)).map(({ key, name, evidence }) => ({ key, name, evidence }));
  const other = OTHER_TECH.filter((t) => t.pattern.test(html)).map((t) => t.name);
  return { tools, other };
}

export function mailProviderFromMx(exchanges: string[]): "google" | "microsoft" | null {
  const all = exchanges.join(" ").toLowerCase();
  if (/google\.com|googlemail\.com/.test(all)) return "google";
  if (/outlook\.com|protection\.outlook|office365/.test(all)) return "microsoft";
  return null;
}

// ---------------------------------------------------------------------------
// Crawl
// ---------------------------------------------------------------------------

export async function crawlWebsite(input: string, options: CrawlOptions = {}): Promise<WebsiteSnapshot> {
  const opts = {
    maxPages: options.maxPages ?? 6,
    timeoutMs: options.timeoutMs ?? 8000,
    allowPrivate: options.allowPrivate ?? false,
    fetchImpl: options.fetchImpl ?? fetch,
  };
  const start = normalizeWebsite(input);
  let home: { url: string; html: string };
  try {
    home = await fetchHtml(start, opts);
  } catch (e) {
    if (e instanceof WebsiteError) throw e;
    throw new WebsiteError(`Could not reach ${new URL(start).hostname}`);
  }
  const root = parse(home.html);
  const domain = new URL(home.url).hostname.replace(/^www\./, "");
  const meta = (name: string) => root.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute("content")?.trim() || null;

  const links = root.querySelectorAll("a[href]").map((a) => ({ href: a.getAttribute("href") ?? "", text: a.text.replace(/\s+/g, " ").trim() }));
  const chosen = choosePages(rankLinks(home.url, links), opts.maxPages - 1);
  const pages: WebsitePage[] = [{ url: home.url, kind: "home", title: root.querySelector("title")?.text.trim() ?? "", text: pageText(root) }];
  const htmls = [home.html];

  const results = await Promise.allSettled(chosen.map((c) => fetchHtml(c.url, opts).then((r) => ({ ...r, kind: c.kind }))));
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const page = parse(r.value.html);
    htmls.push(r.value.html);
    pages.push({ url: r.value.url, kind: r.value.kind, title: page.querySelector("title")?.text.trim() ?? "", text: pageText(page, 4000) });
  }

  const { tools, other } = detectTools(htmls.join("\n"));
  let mailProvider: WebsiteSnapshot["mailProvider"] = null;
  try {
    const mx = await (options.resolveMxImpl ?? resolveMx)(domain);
    mailProvider = mailProviderFromMx(mx.map((m) => m.exchange));
  } catch {
    // No MX records, or DNS unavailable: not evidence either way.
  }
  const detected = [...tools];
  if (mailProvider === "google") detected.push({ key: "gmail", name: "Gmail", evidence: "Company email runs on Google Workspace (MX records)" });
  if (mailProvider === "microsoft") detected.push({ key: "outlook", name: "Outlook", evidence: "Company email runs on Microsoft 365 (MX records)" });

  return {
    url: home.url,
    domain,
    siteName: meta("og:site_name"),
    title: root.querySelector("title")?.text.trim() || null,
    description: meta("description") ?? meta("og:description"),
    language: root.querySelector("html")?.getAttribute("lang") ?? null,
    organization: organizationFromJsonLd(root),
    pages,
    detectedTools: detected,
    otherTechnology: other,
    mailProvider,
  };
}
