// The Composio toolkit directory: every system AutonomOS can connect through Composio
// (about 1,500), plus a curated "popular" set shown first.

export type DirectoryToolkit = {
  slug: string;
  name: string;
  description: string;
  logo: string | null;
  category: string;
  // Composio can run the sign-in for this toolkit without a custom OAuth app.
  managedAuth: boolean;
  version: string | null;
};

// The 20 systems companies connect most. All support Composio-managed sign-in.
export const POPULAR_TOOLKITS = [
  "gmail",
  "googlecalendar",
  "outlook",
  "slack",
  "microsoft_teams",
  "stripe",
  "hubspot",
  "salesforce",
  "zendesk",
  "intercom",
  "notion",
  "googledrive",
  "googlesheets",
  "facebook",
  "instagram",
  "linkedin",
  "jira",
  "asana",
  "airtable",
  "mailchimp",
] as const;

// Next most common, in order. They take the place of popular systems a workspace has already
// connected, so the popular list always shows 20 systems still to connect.
export const POPULAR_BACKFILL = [
  "googledocs",
  "one_drive",
  "zoom",
  "googlemeet",
  "quickbooks",
  "trello",
  "monday",
  "clickup",
  "dropbox",
  "github",
  "calendly",
  "typeform",
  "confluence",
  "linear",
  "whatsapp",
  "youtube",
  "zoho",
  "gitlab",
  "discord",
  "figma",
  "canva",
  "miro",
  "todoist",
  "basecamp",
] as const;

// AutonomOS integration keys that differ from the Composio toolkit slug.
export const TOOLKIT_TO_KEY: Record<string, string> = { googledrive: "google_drive" };
export const KEY_TO_TOOLKIT: Record<string, string> = Object.fromEntries(Object.entries(TOOLKIT_TO_KEY).map(([t, k]) => [k, t]));

export const integrationKeyFor = (toolkit: string) => TOOLKIT_TO_KEY[toolkit] ?? toolkit;
export const toolkitFor = (key: string) => KEY_TO_TOOLKIT[key] ?? key;

const API = "https://backend.composio.dev/api/v3";

type RawToolkit = {
  slug: string;
  name: string;
  composio_managed_auth_schemes?: string[];
  no_auth?: boolean;
  deprecated?: unknown;
  meta?: { description?: string; logo?: string; categories?: Array<{ name: string }>; version?: string };
};

function shape(t: RawToolkit): DirectoryToolkit {
  return {
    slug: t.slug,
    name: t.name,
    description: t.meta?.description ?? "",
    logo: t.meta?.logo ?? null,
    category: titleCase(t.meta?.categories?.[0]?.name ?? "Other"),
    managedAuth: Boolean(t.no_auth) || (t.composio_managed_auth_schemes?.length ?? 0) > 0,
    version: t.meta?.version ?? null,
  };
}

function titleCase(s: string) {
  return s.replace(/(^|\s|&)\S/g, (c) => c.toUpperCase());
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) throw new Error("COMPOSIO_API_KEY is not configured");
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Composio directory ${res.status}`);
  return (await res.json()) as T;
}

// The whole directory, cached for an hour per server instance (about 1,500 entries).
let cache: { at: number; items: DirectoryToolkit[] } | null = null;

export async function listDirectory(): Promise<DirectoryToolkit[]> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.items;
  const items: DirectoryToolkit[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const d = await get<{ items: RawToolkit[]; next_cursor?: string | null }>("/toolkits", { limit: "1000", ...(cursor ? { cursor } : {}) });
    items.push(...d.items.map(shape));
    if (!d.next_cursor) break;
    cursor = d.next_cursor;
  }
  cache = { at: Date.now(), items };
  return items;
}

// The 20 most common systems, skipping the ones already connected (toolkit slugs).
export async function popularToolkits(exclude: ReadonlySet<string> = new Set(), count = POPULAR_TOOLKITS.length): Promise<DirectoryToolkit[]> {
  const all = await listDirectory();
  const bySlug = new Map(all.map((t) => [t.slug, t]));
  return [...POPULAR_TOOLKITS, ...POPULAR_BACKFILL]
    .filter((slug) => !exclude.has(slug))
    .map((slug) => bySlug.get(slug))
    .filter((t): t is DirectoryToolkit => Boolean(t))
    .slice(0, count);
}

// Name matches first, then slug, then description.
// An empty query gives the popular list, without the systems in `connected` (toolkit slugs).
export async function searchDirectory(query: string, limit = 30, connected: ReadonlySet<string> = new Set()): Promise<DirectoryToolkit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return popularToolkits(connected);
  const all = await listDirectory();
  const score = (t: DirectoryToolkit) => {
    const name = t.name.toLowerCase();
    if (name === q || t.slug === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(q) || t.slug.includes(q.replace(/\s+/g, ""))) return 2;
    if (t.category.toLowerCase().includes(q)) return 3;
    if (t.description.toLowerCase().includes(q)) return 4;
    return 9;
  };
  return all
    .map((t) => ({ t, s: score(t) }))
    .filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s || a.t.name.localeCompare(b.t.name))
    .slice(0, limit)
    .map((x) => x.t);
}

export async function getToolkit(slug: string): Promise<DirectoryToolkit | null> {
  const hit = (await listDirectory()).find((t) => t.slug === slug);
  if (hit) return hit;
  try {
    return shape(await get<RawToolkit>(`/toolkits/${encodeURIComponent(slug)}`, {}));
  } catch {
    return null;
  }
}

// Read-only actions of a toolkit, for reading an arbitrary connected system.
export type ToolMeta = { slug: string; version: string | null; properties: Record<string, { type?: string }>; required: string[]; tags: string[] };

export async function readOnlyTools(toolkit: string): Promise<ToolMeta[]> {
  const d = await get<{ items: Array<{ slug: string; version?: string; tags?: string[]; input_parameters?: { properties?: Record<string, { type?: string }>; required?: string[] } }> }>("/tools", {
    toolkit_slug: toolkit,
    limit: "200",
  });
  return d.items
    .map((t) => ({ slug: t.slug, version: t.version ?? null, properties: t.input_parameters?.properties ?? {}, required: t.input_parameters?.required ?? [], tags: t.tags ?? [] }))
    .filter((t) => t.tags.includes("readOnlyHint"));
}
