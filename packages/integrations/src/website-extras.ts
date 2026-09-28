// Deeper reading of a company website, beyond the HTML of a few pages:
// - the tools a company names or shows (a "tools we use" list, logos on a careers page), not
//   only the ones visible as scripts on the page;
// - the pages listed in its sitemap, not only those linked from the home page;
// - sites that render in the browser (single-page apps), whose text lives in their
//   JavaScript bundles rather than in the HTML.

import { integrationKeyFor } from "./directory";

// ---------------------------------------------------------------------------
// Tools named on the website
// ---------------------------------------------------------------------------

// name: how sites write it; slug: the Composio toolkit. `ambiguous` names are also everyday
// words, so they only count in a list of tools or as a logo, never in a sentence alone.
type KnownTool = { name: string; slug: string; aliases?: string[]; ambiguous?: boolean };

export const KNOWN_TOOLS: KnownTool[] = [
  { name: "Gmail", slug: "gmail" },
  { name: "Google Workspace", slug: "gmail", aliases: ["G Suite"] },
  { name: "Google Calendar", slug: "googlecalendar" },
  { name: "Google Drive", slug: "googledrive" },
  { name: "Google Sheets", slug: "googlesheets" },
  { name: "Google Docs", slug: "googledocs" },
  { name: "Google Ads", slug: "googleads", aliases: ["AdWords"] },
  { name: "Google Analytics", slug: "google_analytics", aliases: ["GA4"] },
  { name: "BigQuery", slug: "googlebigquery", aliases: ["Google BigQuery"] },
  { name: "Looker", slug: "looker", aliases: ["Looker Studio"] },
  { name: "Slack", slug: "slack" },
  { name: "Microsoft Teams", slug: "microsoft_teams", aliases: ["MS Teams"] },
  { name: "Outlook", slug: "outlook", aliases: ["Microsoft 365", "Office 365"] },
  { name: "Zoom", slug: "zoom", ambiguous: true },
  { name: "HubSpot", slug: "hubspot" },
  { name: "Salesforce", slug: "salesforce", aliases: ["Pardot"] },
  { name: "Pipedrive", slug: "pipedrive" },
  { name: "Attio", slug: "attio" },
  { name: "Zendesk", slug: "zendesk" },
  { name: "Intercom", slug: "intercom" },
  { name: "Freshdesk", slug: "freshdesk" },
  { name: "Gorgias", slug: "gorgias" },
  { name: "Help Scout", slug: "helpscout" },
  { name: "Front", slug: "front", ambiguous: true },
  { name: "Stripe", slug: "stripe" },
  { name: "PayPal", slug: "paypal" },
  { name: "Mollie", slug: "mollie" },
  { name: "Adyen", slug: "adyen" },
  { name: "Square", slug: "square", ambiguous: true },
  { name: "Xero", slug: "xero" },
  { name: "QuickBooks", slug: "quickbooks" },
  { name: "NetSuite", slug: "netsuite" },
  { name: "SAP", slug: "sap", ambiguous: true },
  { name: "Pleo", slug: "pleo" },
  { name: "Notion", slug: "notion" },
  { name: "Confluence", slug: "confluence" },
  { name: "Jira", slug: "jira" },
  { name: "Asana", slug: "asana" },
  { name: "Trello", slug: "trello" },
  { name: "Linear", slug: "linear", ambiguous: true },
  { name: "monday.com", slug: "monday" },
  { name: "ClickUp", slug: "clickup" },
  { name: "Miro", slug: "miro" },
  { name: "Figma", slug: "figma" },
  { name: "Airtable", slug: "airtable" },
  { name: "Dropbox", slug: "dropbox" },
  { name: "OneDrive", slug: "one_drive" },
  { name: "SharePoint", slug: "share_point" },
  { name: "GitHub", slug: "github" },
  { name: "GitLab", slug: "gitlab" },
  { name: "Bitbucket", slug: "bitbucket" },
  { name: "Shopify", slug: "shopify" },
  { name: "WooCommerce", slug: "woocommerce" },
  { name: "Mailchimp", slug: "mailchimp" },
  { name: "Klaviyo", slug: "klaviyo" },
  { name: "Brevo", slug: "brevo", aliases: ["Sendinblue"] },
  { name: "ActiveCampaign", slug: "activecampaign" },
  { name: "Braze", slug: "braze" },
  { name: "Customer.io", slug: "customerio" },
  { name: "Segment", slug: "segment", ambiguous: true },
  { name: "Mixpanel", slug: "mixpanel" },
  { name: "Amplitude", slug: "amplitude" },
  { name: "Hotjar", slug: "hotjar" },
  { name: "Typeform", slug: "typeform" },
  { name: "Calendly", slug: "calendly" },
  { name: "DocuSign", slug: "docusign" },
  { name: "PandaDoc", slug: "pandadoc" },
  { name: "BambooHR", slug: "bamboohr" },
  { name: "Personio", slug: "personio" },
  { name: "HiBob", slug: "hibob" },
  { name: "Workday", slug: "workday" },
  { name: "Greenhouse", slug: "greenhouse" },
  { name: "Snowflake", slug: "snowflake" },
  { name: "Databricks", slug: "databricks" },
  { name: "Tableau", slug: "tableau" },
  { name: "Power BI", slug: "powerbi" },
  { name: "Metabase", slug: "metabase" },
  { name: "Sentry", slug: "sentry" },
  { name: "Datadog", slug: "datadog" },
  { name: "Grafana", slug: "grafana" },
  { name: "PagerDuty", slug: "pagerduty" },
  { name: "n8n", slug: "n8n" },
  { name: "Zapier", slug: "zapier" },
  { name: "Facebook", slug: "facebook", aliases: ["Meta Ads", "Facebook Ads"] },
  { name: "Instagram", slug: "instagram" },
  { name: "LinkedIn", slug: "linkedin" },
  { name: "YouTube", slug: "youtube" },
  { name: "TikTok", slug: "tiktok" },
  { name: "Canva", slug: "canva" },
  { name: "Loom", slug: "loom" },
  { name: "Webflow", slug: "webflow" },
  { name: "WordPress", slug: "wordpress" },
  { name: "Contentful", slug: "contentful" },
  { name: "ElevenLabs", slug: "elevenlabs" },
  { name: "Supabase", slug: "supabase" },
];

// Social profiles are linked from almost every footer; that is not evidence of using the tool
// for work, so they count only when named or shown as a tool, never as a plain footer link.
const SOCIAL = new Set(["facebook", "instagram", "linkedin", "youtube", "tiktok"]);

export type ToolMention = { key: string; slug: string; name: string; where: string; strength: "logo" | "list" | "text" };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATTERNS = KNOWN_TOOLS.map((t) => ({
  tool: t,
  // Case-sensitive, whole word: "Jira" but not "jiras", "SAP" but not "sap".
  re: new RegExp(`(?<![\\w.-])(?:${[t.name, ...(t.aliases ?? [])].map(escape).join("|")})(?![\\w-])`, "g"),
}));

export type MentionSource = { where: string; text: string; strength?: "logo" };

/**
 * Tools the site names. A name in running text counts when it is unambiguous; an ambiguous
 * name (Linear, Segment, Front) counts only as a logo or next to other tools in a list.
 */
export function mentionedTools(sources: MentionSource[]): ToolMention[] {
  const found = new Map<string, ToolMention>();
  const rank = { logo: 3, list: 2, text: 1 } as const;
  for (const src of sources) {
    const hits: Array<{ tool: KnownTool; index: number }> = [];
    for (const { tool, re } of PATTERNS) {
      re.lastIndex = 0;
      for (const m of src.text.matchAll(re)) hits.push({ tool, index: m.index ?? 0 });
    }
    for (const h of hits) {
      // Next to an unambiguous tool name, an ambiguous one reads as part of a list of tools.
      const near = hits.filter((o) => o.tool !== h.tool && !o.tool.ambiguous && Math.abs(o.index - h.index) < 120).length;
      const strength: ToolMention["strength"] = src.strength === "logo" ? "logo" : near >= 1 ? "list" : "text";
      if (h.tool.ambiguous && strength === "text") continue;
      const key = integrationKeyFor(h.tool.slug);
      const prev = found.get(key);
      if (!prev || rank[strength] > rank[prev.strength]) found.set(key, { key, slug: h.tool.slug, name: h.tool.name, where: src.where, strength });
    }
  }
  return [...found.values()].filter((m) => !SOCIAL.has(m.key) || m.strength !== "text");
}

// ---------------------------------------------------------------------------
// Sitemaps
// ---------------------------------------------------------------------------

/** Page URLs in a sitemap (or the child sitemaps of a sitemap index). */
export function sitemapUrls(xml: string): { pages: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.replace(/&amp;/g, "&"));
  return /<sitemapindex/i.test(xml) ? { pages: [], sitemaps: locs } : { pages: locs, sitemaps: [] };
}

/** Link text for a URL found in a sitemap: its path in words ("careers/teams/engineering"). */
export function linkTextFromPath(url: string): string {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).join(" ").replace(/[-_]+/g, " ");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Sites that render in the browser
// ---------------------------------------------------------------------------

/** True when a page's HTML carries almost no text and boots a JavaScript app instead. */
export function isScriptRendered(html: string, visibleText: string): boolean {
  if (visibleText.replace(/\s+/g, " ").trim().length > 400) return false;
  return /<script[^>]+type=["']module["']/i.test(html) || /<div[^>]+id=["'](root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i.test(html);
}

/** Same-origin script URLs a page loads. */
export function scriptUrls(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const out = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1]!, base);
      if (u.origin === base.origin && /\.m?js(\?|$)/.test(u.pathname)) out.add(u.toString());
    } catch {
      // Not a URL.
    }
  }
  return [...out];
}

/** Code-split chunks a bundle refers to ("assets/CareerTeam-B54b.js"), as absolute URLs. */
export function chunkUrls(js: string, bundleUrl: string): string[] {
  const out = new Set<string>();
  const dir = new URL(".", bundleUrl);
  for (const m of js.matchAll(/["'`]((?:\.{0,2}\/)?(?:[\w-]+\/)*[\w.-]+-[\w-]{6,}\.m?js)["'`]/g)) {
    const ref = m[1]!;
    try {
      // "assets/x.js" is relative to the site root in Vite builds; "./x.js" to the bundle.
      const u = ref.startsWith(".") ? new URL(ref, dir) : new URL(ref.startsWith("/") ? ref : `/${ref}`, bundleUrl);
      if (u.origin === dir.origin) out.add(u.toString());
    } catch {
      // Not a URL.
    }
  }
  return [...out];
}

// Chunks for signed-in areas say nothing about the company and may not be meant for visitors.
export const PRIVATE_CHUNK = /admin|login|logout|auth|sign-?in|sign-?up|dashboard|account|checkout|settings/i;

/** A chunk's name without its hash ("CareerTeam"), used as the page it renders. */
export function chunkName(url: string): string {
  const file = url.split("/").pop() ?? "";
  return file.replace(/\.m?js.*$/, "").replace(/-[\w-]{6,}$/, "");
}

const CODEY = /[{}();=<>]|=>|\b(function|return|const|var|let|typeof|undefined|null|true|false|prototype|webpack|__)\b/;
// Utility class lists ("flex items-center gap-2") are not copy.
const classy = (s: string) => {
  const words = s.split(/\s+/);
  return words.filter((w) => /[-:[\]/]/.test(w) || /^[a-z0-9]+$/.test(w)).length / words.length > 0.6 && s === s.toLowerCase();
};

/**
 * The human-readable text in a JavaScript bundle: string literals that read like copy
 * (headlines, paragraphs, list items), plus the names of the logos it embeds.
 */
export function bundleCopy(js: string, maxChars = 6000): { text: string; logos: string[] } {
  const logos = [...new Set([...js.matchAll(/title:\s*"([^"]{2,40})",\s*slug:\s*"[a-z0-9]+"/g)].map((m) => m[1]!))];
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const m of js.matchAll(/"((?:[^"\\\n]|\\.){12,600})"|'((?:[^'\\\n]|\\.){12,600})'|`((?:[^`\\$]|\\.){12,600})`/g)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\\n/g, " ").replace(/\\(.)/g, "$1").replace(/\s+/g, " ").trim();
    if (raw.split(" ").length < 3 || !/^[\p{Lu}\p{N}"'(€$£]/u.test(raw) || !/\p{L}{3}/u.test(raw)) continue;
    if (CODEY.test(raw) || classy(raw) || /https?:\/\/|\.(js|css|png|svg)\b/.test(raw)) continue;
    // Library error and warning messages ("Exponent out of range:") are not copy either.
    if (/:$/.test(raw) || /\b(error|exceeded|invalid|deprecated|warning|expected|failed to)\b/i.test(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    lines.push(raw);
  }
  return { text: lines.join("\n").slice(0, maxChars), logos };
}
