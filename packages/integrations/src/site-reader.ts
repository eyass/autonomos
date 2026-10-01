import { createHash } from "node:crypto";
import { parse, type HTMLElement } from "node-html-parser";
import { isScriptRendered, sitemapUrls } from "./website-extras";
import { fetchPage, fetchPlain, normalizeWebsite, type PageFetchOptions } from "./website";

export { normalizeWebsite };

// Reads a whole public website (or its help centre) into company knowledge.
//
// Breadth first: every page one link (or one path segment) from the start is read before
// anything deeper, so a cut-off read still holds the pages that say the most. Within a level,
// pages likely to explain how the company works (help, policies, pricing, about) go first.
// Pages that never carry knowledge (log in, cart, search, tag archives, assets) are never
// fetched, and large repeated sections (/listings/123, /product/blue-sofa-42) are sampled
// instead of read in full. A read stops at its deadline and returns its state, so the next
// round resumes where it left off.

export type SiteKind = "website" | "help_center";
export type SitePage = { url: string; title: string; text: string; depth: number };
type Queued = { url: string; depth: number; score: number };

export type SiteReadState = {
  kind: SiteKind;
  start: string;
  hosts: string[];
  // Paths a website read leaves to the help-centre source.
  exclude: string[];
  lang: string | null;
  queue: Queued[];
  seen: string[];
  hashes: string[];
  templates: Record<string, { found: number; read: number }>;
  robots: string[] | null;
  counts: { found: number; read: number; skipped: number; failed: number; sampledOut: number; unreadable: number; capped: number };
  done: boolean;
};

export type ReadSiteOptions = {
  fetch: Omit<PageFetchOptions, "userAgent">;
  deadline: number;
  onPage: (page: SitePage) => unknown;
  maxPages?: number;
  maxPagesThisRound?: number;
  concurrency?: number;
  sampleLimit?: number;
};

const USER_AGENT = "AutonomOS-Knowledge/1.0 (+reads public pages to learn how a company works)";
export const SITE_LIMITS: Record<SiteKind, number> = { website: 1000, help_center: 2000 };

const ASSET = /\.(png|jpe?g|gif|svg|webp|ico|css|js|mjs|map|woff2?|ttf|eot|mp4|mov|webm|mp3|wav|zip|gz|rar|7z|dmg|exe|apk|xml|json|rss|atom|csv|xlsx?|pptx?)$/i;
const NEVER =
  /(^|\/)(log-?in|log-?out|sign-?in|sign-?up|sign-?out|register|account|my-account|profile\/edit|password|reset|forgot|auth|oauth|sso|cart|basket|bag|checkout|wishlist|favourites|favorites|compare|search|zoeken|suche|tag|tags|author|feed|wp-json|wp-admin|cdn-cgi|print|share|calendar|unsubscribe)(\/|$)|\/page\/\d+|\/\d{4}\/\d{2}\/\d{2}(\/|$)/i;
const SKIP_PARAMS = /^(utm_\w+|gclid|fbclid|msclkid|ref|ref_src|mc_cid|mc_eid|_ga|sort|order|filter|view|q|query|s)$/i;
const HIGH =
  /(help|support|faq|questions|docs|documentation|guide|how-?to|how-it-works|policy|policies|returns?|refunds?|shipping|delivery|warranty|terms|conditions|privacy|pricing|prices|plans|fees|about|company|who-we-are|services|features|products?|solutions|contact|sellers?|buyers?|safety|trust)/i;
const LANGS = new Set("en de fr nl es it pt sv da no nb fi pl cs sk hu ro bg el tr ru uk ja zh ko ar he".split(" "));
const ID_SEGMENT = /^(\d+|[0-9a-f]{8,}|[0-9a-f-]{20,}|.*\d{2,}.*)$/i;
const HELP_PATH = /^\/(help|support|faq|faqs|kb|knowledge-?base|hc|docs|help-?cent(er|re)|support\/solutions|customer-?service|klantenservice|hilfe)(\/|$)/i;
const HELP_SUBDOMAIN = /^(help|support|docs|faq|kb|helpdesk|hilfe|klantenservice)\./i;
const HOSTED_HELP = /(\.zendesk\.com$|^intercom\.help$|\.intercom\.help$|\.freshdesk\.com$|\.helpscoutdocs\.com$|\.gitbook\.io$|\.notion\.site$|\.helpjuice\.com$|\.document360\.io$)/i;

const rootDomain = (host: string) => host.replace(/^www\./, "").split(".").slice(-2).join(".");

export function newSiteState(start: string, kind: SiteKind, exclude: string[] = []): SiteReadState {
  const url = new URL(start);
  return {
    kind,
    start: url.toString(),
    hosts: [url.hostname, url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`],
    exclude,
    lang: null,
    queue: [{ url: normalise(url)!, depth: 0, score: 3 }],
    seen: [normalise(url)!],
    hashes: [],
    templates: {},
    robots: null,
    counts: { found: 1, read: 0, skipped: 0, failed: 0, sampledOut: 0, unreadable: 0, capped: 0 },
    done: false,
  };
}

// The canonical form of an address: no fragment, no tracking or list parameters, no trailing slash.
function normalise(url: URL): string | null {
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const u = new URL(url.toString());
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (SKIP_PARAMS.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

// Whether a page is worth reading, and how early.
export function planUrl(url: URL, kind: SiteKind): { skip: string } | { score: number } {
  const path = decodeURIComponent(url.pathname);
  if (ASSET.test(path)) return { skip: "file" };
  if (NEVER.test(path)) return { skip: "account, cart or listing page" };
  if ([...url.searchParams.keys()].some((k) => /^(q|query|s|search|page|p)$/i.test(k))) return { skip: "search or paged list" };
  const depth = path.split("/").filter(Boolean).length;
  const base = kind === "help_center" ? 2 : HIGH.test(path) ? 3 : depth <= 1 ? 2 : 1;
  return { score: base - Math.max(0, depth - 1) * 0.5 };
}

// The page's section pattern: ids and numbered slugs as *, so /listings/12 and /listings/13 match.
export function templateKey(url: URL): string {
  return (
    "/" +
    url.pathname
      .split("/")
      .filter(Boolean)
      .map((s) => (ID_SEGMENT.test(s) ? "*" : s))
      .join("/")
  );
}

// Where the company's help centre probably lives, from the links its site carries.
export function helpCentreCandidates(home: string, links: string[]): string[] {
  const origin = new URL(home);
  const domain = rootDomain(origin.hostname);
  const out: string[] = [];
  for (const href of links) {
    let u: URL;
    try {
      u = new URL(href, origin);
    } catch {
      continue;
    }
    const host = u.hostname.toLowerCase();
    const sameSite = rootDomain(host) === domain;
    const hit = (sameSite && HELP_SUBDOMAIN.test(host)) || (sameSite && HELP_PATH.test(u.pathname)) || HOSTED_HELP.test(host);
    if (!hit) continue;
    // A help path on the main site starts at its first segment; elsewhere, where the link points.
    const start = sameSite && !HELP_SUBDOMAIN.test(host) ? `${u.origin}/${u.pathname.split("/").filter(Boolean)[0]}` : u.toString();
    if (!out.some((o) => o === start || start.startsWith(`${o}/`))) out.push(start);
  }
  return out;
}

// Disallow rules for every agent and for ours, as path prefixes (with * and $ honoured).
function robotsRules(txt: string): string[] {
  const rules: string[] = [];
  let applies = false;
  let lastWasAgent = false;
  for (const raw of txt.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    const [k, ...rest] = line.split(":");
    const key = (k ?? "").trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      const match = value === "*" || /autonomos/i.test(value);
      applies = lastWasAgent ? applies || match : match;
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (applies && key === "disallow" && value) rules.push(value);
  }
  return rules;
}

function disallowed(path: string, rules: string[]): boolean {
  return rules.some((r) => {
    const re = new RegExp(`^${r.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`);
    return re.test(path);
  });
}

// The page's readable text, with h1–h3 kept as "# " lines for splitting into passages.
function readable(root: HTMLElement): { title: string; text: string } {
  const title = (root.querySelector("title")?.text ?? root.querySelector("h1")?.text ?? "").replace(/\s+/g, " ").trim();
  root.querySelectorAll("script, style, noscript, svg, iframe, template, form, button, nav, header, footer, aside, [aria-hidden=true], [role=navigation], .cookie, #cookie").forEach((n) => n.remove());
  for (const h of root.querySelectorAll("h1, h2, h3")) h.set_content(`\n# ${h.text.replace(/\s+/g, " ").trim()}\n`);
  const main = root.querySelector("main") ?? root.querySelector("article") ?? root.querySelector("[role=main]") ?? root.querySelector("body") ?? root;
  const lines = main.structuredText
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1);
  return { title, text: lines.filter((l, i) => l.startsWith("# ") || lines.indexOf(l) === i).join("\n") };
}

// Reads pages from the state's queue until the site is done, the round's page budget is
// used or the deadline passes. Returns the state to save and resume from.
export async function readSite(state: SiteReadState, options: ReadSiteOptions): Promise<SiteReadState> {
  const fetchOpts: PageFetchOptions = { ...options.fetch, userAgent: USER_AGENT };
  const concurrency = options.concurrency ?? 8;
  const sampleLimit = options.sampleLimit ?? 10;
  const maxPages = options.maxPages ?? SITE_LIMITS[state.kind];
  const seen = new Set(state.seen);
  const hashes = new Set(state.hashes);
  let thisRound = 0;

  const enqueue = (href: string, from: URL, depth: number) => {
    let u: URL;
    try {
      u = new URL(href, from);
    } catch {
      return;
    }
    const key = normalise(u);
    if (!key || seen.has(key)) return;
    const url = new URL(key);
    if (!state.hosts.includes(url.hostname)) return;
    if (state.kind === "website" && state.exclude.some((e) => key === e || key.startsWith(`${e}/`))) return;
    seen.add(key);
    state.counts.found++;
    const plan = planUrl(url, state.kind);
    if ("skip" in plan || (state.robots && disallowed(url.pathname, state.robots))) {
      state.counts.skipped++;
      return;
    }
    // One language version: skip a language prefix that is not the home page's.
    const first = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase().split("-")[0];
    if (first && LANGS.has(first) && state.lang && first !== state.lang) {
      state.counts.skipped++;
      return;
    }
    const template = templateKey(url);
    if (template.includes("*") && state.kind === "website") {
      const t = (state.templates[template] ??= { found: 0, read: 0 });
      t.found++;
      if (t.found > sampleLimit) {
        state.counts.sampledOut++;
        return;
      }
    }
    state.queue.push({ url: key, depth, score: plan.score });
  };

  // The rules and the sitemap, once per site.
  if (state.robots === null) {
    const origin = new URL(state.start).origin;
    const robotsTxt = await fetchPlain(`${origin}/robots.txt`, fetchOpts).then((r) => r.html).catch(() => "");
    state.robots = robotsRules(robotsTxt);
    const maps = new Set([...[...robotsTxt.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]!), `${origin}/sitemap.xml`]);
    const pages: string[] = [];
    const visit = async (loc: string, level: number) => {
      const xml = await fetchPlain(loc, fetchOpts).then((r) => r.html).catch(() => "");
      const { pages: p, sitemaps } = sitemapUrls(xml);
      pages.push(...p);
      if (level < 2) for (const child of sitemaps.slice(0, 20)) await visit(child, level + 1);
    };
    for (const loc of [...maps].slice(0, 5)) await visit(loc, 0);
    const startDepth = new URL(state.start).pathname.split("/").filter(Boolean).length;
    for (const p of pages.slice(0, 20_000)) {
      try {
        const depth = Math.max(1, new URL(p).pathname.split("/").filter(Boolean).length - startDepth);
        enqueue(p, new URL(state.start), depth);
      } catch {
        // Not an address.
      }
    }
  }

  while (state.queue.length && Date.now() < options.deadline) {
    if (state.counts.read >= maxPages) {
      state.counts.capped += state.queue.length;
      state.queue = [];
      break;
    }
    if (options.maxPagesThisRound !== undefined && thisRound >= options.maxPagesThisRound) break;
    // The shallowest level first; within it, the most promising pages.
    const level = Math.min(...state.queue.map((q) => q.depth));
    const candidates = state.queue.filter((q) => q.depth === level).sort((a, b) => b.score - a.score);
    const room = Math.min(concurrency, maxPages - state.counts.read, options.maxPagesThisRound !== undefined ? options.maxPagesThisRound - thisRound : Infinity);
    const batch = candidates.slice(0, room);
    const taken = new Set(batch.map((b) => b.url));
    state.queue = state.queue.filter((q) => !taken.has(q.url));
    thisRound += batch.length;

    await Promise.all(
      batch.map(async (item) => {
        let res: { url: string; html: string };
        try {
          res = await fetchPage(item.url, fetchOpts);
        } catch {
          state.counts.failed++;
          return;
        }
        const finalUrl = new URL(res.url);
        if (!state.hosts.includes(finalUrl.hostname)) {
          state.counts.skipped++;
          return;
        }
        const root = parse(res.html);
        if (item.depth === 0 && !state.lang) state.lang = (root.querySelector("html")?.getAttribute("lang") ?? "").toLowerCase().split("-")[0] || null;
        const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute("href");
        if (canonical) {
          const c = normalise(new URL(canonical, finalUrl));
          if (c && c !== item.url && seen.has(c) && item.depth > 0) {
            state.counts.skipped++;
            return;
          }
          if (c) seen.add(c);
        }
        for (const a of root.querySelectorAll("a[href]")) enqueue(a.getAttribute("href") ?? "", finalUrl, item.depth + 1);
        const { title, text } = readable(root);
        const plain = text.replace(/^# /gm, "");
        if (plain.length < 40) {
          if (isScriptRendered(res.html, plain)) state.counts.unreadable++;
          else state.counts.skipped++;
          return;
        }
        const hash = createHash("sha1").update(plain).digest("hex").slice(0, 16);
        if (hashes.has(hash)) {
          state.counts.skipped++;
          return;
        }
        hashes.add(hash);
        state.counts.read++;
        const template = templateKey(finalUrl);
        if (state.templates[template]) state.templates[template]!.read++;
        await options.onPage({ url: item.url, title, text, depth: item.depth });
      }),
    );
  }

  state.seen = [...seen];
  state.hashes = [...hashes];
  state.done = state.queue.length === 0;
  return state;
}

// Every link on a site's home page, as absolute addresses (to find its help centre).
export async function homeLinks(home: string, opts: Omit<PageFetchOptions, "userAgent">): Promise<string[]> {
  const page = await fetchPage(home, { ...opts, userAgent: USER_AGENT });
  return parse(page.html)
    .querySelectorAll("a[href]")
    .flatMap((a) => {
      try {
        return [new URL(a.getAttribute("href") ?? "", page.url).toString()];
      } catch {
        return [];
      }
    });
}
