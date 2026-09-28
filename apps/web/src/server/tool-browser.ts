import "server-only";
import {
  composioConfigured,
  DIRECTORY_GROUPS,
  directoryGroups,
  integrationKeyFor,
  listDirectory,
  POPULAR_BACKFILL,
  POPULAR_TOOLKITS,
  searchDirectory,
  toolkitFor,
  type DirectoryToolkit,
} from "@autonomos/integrations";
import { KNOWN_TOOLS } from "@autonomos/integrations/website";
import { adminDb, type Session } from "@/lib/session";
import { SANDBOX_INTEGRATIONS } from "./integrations";

// The tool browser: every system a workspace can connect, by category, with the most popular
// first. With Composio it is the whole directory (about 1,500 systems); without it, the
// built-in catalog, so the page works the same in every environment.

export type BrowseTool = {
  slug: string;
  key: string;
  name: string;
  description: string;
  logo: string | null;
  category: string;
  connected: boolean;
  provider: string | null;
  detected: boolean;
  // Can be tried on sample data held in AutonomOS.
  sandbox: boolean;
  // Can be connected to a real account.
  live: boolean;
  // Connecting asks for the customer's own API key or login instead of a sign-in.
  usesKey: boolean;
};

export type BrowseCategory = { key: string; label: string; count: number | null };

export const POPULAR = "popular";
export const DETECTED = "detected";
export const CONNECTED = "connected";

// Built-in catalog categories, as directory groups.
const CATALOG_GROUP: Record<string, string> = {
  communication: "communication",
  email: "communication",
  crm: "sales",
  sales: "sales",
  support: "support",
  payments: "finance",
  finance: "finance",
  accounting: "finance",
  knowledge: "productivity",
  documents: "productivity",
  marketing: "marketing",
  advertising: "marketing",
  analytics: "analytics",
  data: "analytics",
  "e-commerce": "ecommerce",
  ecommerce: "ecommerce",
  projects: "projects",
  hr: "hr",
};

type CatalogRow = { key: string; name: string; category: string; description: string; logo: string | null; sort_order: number | null; source: string | null };

async function context(session: Session) {
  const db = adminDb();
  const [{ data: conns }, { data: catalog }] = await Promise.all([
    db.from("integration_connections").select("integration_key, provider").eq("organization_id", session.org.id).eq("status", "connected"),
    db.from("integrations").select("key, name, category, description, logo, sort_order, source").order("sort_order"),
  ]);
  return {
    connected: new Map((conns ?? []).map((c) => [c.integration_key, c.provider as string | null])),
    catalog: (catalog ?? []) as CatalogRow[],
    detected: new Set(session.org.detectedTools),
    live: composioConfigured(),
  };
}

type Ctx = Awaited<ReturnType<typeof context>>;

function fromDirectory(t: DirectoryToolkit, ctx: Ctx): BrowseTool {
  const key = integrationKeyFor(t.slug);
  const row = ctx.catalog.find((c) => c.key === key);
  return {
    slug: t.slug,
    key,
    name: t.name,
    description: (row?.source !== "directory" && row?.description) || t.description.slice(0, 160),
    logo: t.logo ?? row?.logo ?? null,
    category: t.category,
    connected: ctx.connected.has(key),
    provider: ctx.connected.get(key) ?? null,
    detected: ctx.detected.has(key),
    sandbox: SANDBOX_INTEGRATIONS.includes(key),
    live: ctx.live && t.connect !== "setup",
    usesKey: t.connect === "key",
  };
}

function fromCatalog(r: CatalogRow, ctx: Ctx): BrowseTool {
  return {
    slug: toolkitFor(r.key),
    key: r.key,
    name: r.name,
    description: r.description,
    logo: r.logo,
    category: r.category,
    connected: ctx.connected.has(r.key),
    provider: ctx.connected.get(r.key) ?? null,
    detected: ctx.detected.has(r.key),
    sandbox: SANDBOX_INTEGRATIONS.includes(r.key),
    live: ctx.live,
    usesKey: false,
  };
}

const groupOfCatalog = (r: CatalogRow) => CATALOG_GROUP[r.category.toLowerCase()] ?? "other";

// A tool the website named that neither the directory nor the catalog knows yet.
function named(key: string, ctx: Ctx): BrowseTool {
  const known = KNOWN_TOOLS.find((t) => integrationKeyFor(t.slug) === key);
  return {
    slug: toolkitFor(key),
    key,
    name: known?.name ?? key,
    description: "Found on your website. Not available to connect yet.",
    logo: null,
    category: "Other",
    connected: ctx.connected.has(key),
    provider: ctx.connected.get(key) ?? null,
    detected: true,
    sandbox: false,
    live: false,
    usesKey: false,
  };
}

/** The left-hand menu: special views first, then every category with its size. */
export async function browseCategories(session: Session): Promise<BrowseCategory[]> {
  const ctx = await context(session);
  const special: BrowseCategory[] = [{ key: POPULAR, label: "Most popular", count: null }];
  if (ctx.detected.size) special.push({ key: DETECTED, label: "Found on your website", count: ctx.detected.size });
  if (ctx.connected.size) special.push({ key: CONNECTED, label: "Connected", count: ctx.connected.size });
  if (ctx.live) {
    const groups = await directoryGroups().catch(() => []);
    if (groups.length) return [...special, ...groups.map((g) => ({ key: g.key, label: g.label, count: g.count }))];
  }
  const curated = ctx.catalog.filter((r) => r.source !== "directory");
  const groups = DIRECTORY_GROUPS.map((g) => ({ key: g.key, label: g.label, count: curated.filter((r) => groupOfCatalog(r) === g.key).length })).filter((g) => g.count > 0);
  return [...special, ...groups];
}

/** The tools in one view (a category, a special view, or a search across everything). */
export async function browseTools(session: Session, view: string, query = ""): Promise<BrowseTool[]> {
  const ctx = await context(session);
  const q = query.trim().toLowerCase().slice(0, 80);
  const group = [POPULAR, DETECTED, CONNECTED].includes(view) ? null : view;

  if (view === CONNECTED || view === DETECTED) {
    const keys = view === CONNECTED ? [...ctx.connected.keys()] : [...ctx.detected];
    const directory = ctx.live ? await listDirectory().catch(() => [] as DirectoryToolkit[]) : [];
    return keys
      .map((key) => {
        const d = directory.find((t) => integrationKeyFor(t.slug) === key);
        const r = ctx.catalog.find((c) => c.key === key);
        return d ? fromDirectory(d, ctx) : r ? fromCatalog(r, ctx) : named(key, ctx);
      })
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.live || b.sandbox) - Number(a.live || a.sandbox) || a.name.localeCompare(b.name));
  }

  if (ctx.live) {
    try {
      if (!q && !group) {
        const all = await listDirectory();
        const bySlug = new Map(all.map((t) => [t.slug, t]));
        return [...POPULAR_TOOLKITS, ...POPULAR_BACKFILL]
          .map((s) => bySlug.get(s))
          .filter((t): t is DirectoryToolkit => Boolean(t))
          .slice(0, 36)
          .map((t) => fromDirectory(t, ctx));
      }
      return (await searchDirectory(q, group ? 300 : 60, new Set(), group)).map((t) => fromDirectory(t, ctx));
    } catch (e) {
      console.error("tool directory", e);
      // Fall through to the built-in catalog.
    }
  }
  return ctx.catalog
    .filter((r) => r.source !== "directory")
    .filter((r) => !group || groupOfCatalog(r) === group)
    .filter((r) => !q || `${r.name} ${r.category} ${r.description}`.toLowerCase().includes(q))
    .map((r) => fromCatalog(r, ctx));
}

// Every tool with what the browser needs to show any view by itself: its groups and how
// well known it is. Loaded once per visit so switching category or searching is instant.
export type BrowseEntry = BrowseTool & { groups: string[]; rank: number; order: number };

const RANK = new Map<string, number>([...POPULAR_TOOLKITS, ...POPULAR_BACKFILL].map((slug, i) => [slug, i]));
const CONNECT_ORDER = { signin: 0, key: 1, setup: 2 } as const;

export async function browseAll(session: Session): Promise<BrowseEntry[]> {
  const ctx = await context(session);
  if (ctx.live) {
    try {
      return (await listDirectory()).map((t) => ({
        ...fromDirectory(t, ctx),
        description: t.description.slice(0, 120),
        groups: t.groups,
        rank: RANK.get(t.slug) ?? 999,
        order: CONNECT_ORDER[t.connect],
      }));
    } catch (e) {
      console.error("tool directory", e);
    }
  }
  return ctx.catalog.filter((r) => r.source !== "directory").map((r, i) => ({ ...fromCatalog(r, ctx), groups: [groupOfCatalog(r)], rank: i, order: 0 }));
}
