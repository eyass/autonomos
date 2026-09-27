import { readOnlyTools, toolkitFor } from "./directory";
import { adsCustomerIds, adsField, arr, bqProjects, bqRegion, bqRow, exec, firstList, genericCandidates, iso, readerArgs, redact, SCANNABLE, type ScanContext } from "./scan";

// A first inventory of a connected system, taken once when it is connected: what it holds
// and how to read it. BigQuery projects, datasets and table schemas; ad accounts; mail labels;
// calendars; Notion databases; spreadsheets and their tabs; CRM pipelines and stages; Slack
// channels; and, for any other system, which read actions work and the fields they return.
// Metadata only: record contents never go in here. Scans and discovery reuse it instead of
// looking these up on every read.

export type InventoryResource = {
  kind: string;
  id: string;
  name?: string;
  // The project a dataset or table belongs to, the manager account of an ad account.
  parent?: string;
  // Where the data lives (BigQuery dataset location).
  location?: string;
  // Columns, properties, stages or tabs, e.g. "order_id INT64".
  fields?: string[];
  count?: number;
  updatedAt?: string | null;
  meta?: Record<string, string>;
};

// A read action that returned data when the inventory was taken, and how to call it.
export type InventoryReader = {
  slug: string;
  version: string | null;
  limitParam: string | null;
  since: { param: string; unix: boolean } | null;
  tokenParam: string | null;
  // Field names of the records it returns.
  fields: string[];
};

export type SystemInventory = {
  version: 1;
  takenAt: string;
  summary: string;
  resources: InventoryResource[];
  readers: InventoryReader[];
  // What could not be looked at, in customer language.
  notes: string[];
};

const MAX_RESOURCES = 400;

export async function inventorySystem(integration: string, ctx: ScanContext): Promise<SystemInventory> {
  const resources: InventoryResource[] = [];
  const readers: InventoryReader[] = [];
  const notes: string[] = [];
  // Each lookup stands alone: one that fails is noted and the rest still count.
  const step = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      console.error("inventory step failed", integration, what, e);
      notes.push(`Could not list ${what}.`);
    }
  };
  if (ctx.connection.provider === "sandbox") {
    if (SCANNABLE.includes(integration)) resources.push({ kind: "sample data", id: integration, name: `Sample ${integration} records` });
    else notes.push("This sandbox holds no data.");
  } else {
    const toolkit = toolkitFor(integration);
    const add = (r: InventoryResource) => resources.length < MAX_RESOURCES && resources.push(r);
    switch (toolkit) {
      case "googlebigquery":
        await bigQuery(ctx, add, step);
        break;
      case "googleads":
        await googleAds(ctx, add, step);
        break;
      case "gmail":
        await step("the mailbox", async () => {
          const p = await exec(ctx, "GMAIL_GET_PROFILE", {});
          add({ kind: "mailbox", id: "me", name: "Mailbox", count: Number(p.messagesTotal ?? 0), meta: { threads: String(p.threadsTotal ?? "") } });
        });
        await step("labels", async () => {
          for (const l of firstList(await exec(ctx, "GMAIL_LIST_LABELS", {})))
            if (l.type === "user") add({ kind: "label", id: String(l.id), name: redact(l.name, 80), count: l.messagesTotal === undefined ? undefined : Number(l.messagesTotal) });
        });
        break;
      case "googlecalendar":
        await step("calendars", async () => {
          for (const c of firstList(await exec(ctx, "GOOGLECALENDAR_LIST_CALENDARS", { max_results: 50 })))
            add({ kind: "calendar", id: String(c.id), name: redact(c.summaryOverride ?? c.summary, 80), meta: { role: String(c.accessRole ?? ""), primary: c.primary ? "yes" : "no" } });
        });
        break;
      case "notion":
        await step("databases", async () => {
          for (const d of firstList(await exec(ctx, "NOTION_SEARCH_NOTION_PAGE", { query: "", filter_value: "database", page_size: 50 }))) {
            const title = Array.isArray(d.title) ? (d.title as Array<{ plain_text?: string }>).map((t) => t.plain_text ?? "").join("") : "";
            add({ kind: "database", id: String(d.id), name: redact(title || "Untitled", 80), fields: Object.keys((d.properties as object) ?? {}).slice(0, 40), updatedAt: iso(d.last_edited_time) });
          }
        });
        break;
      case "googlesheets":
        await step("spreadsheets", async () => {
          const files = firstList(await exec(ctx, "GOOGLESHEETS_SEARCH_SPREADSHEETS", { max_results: 25, order_by: "modifiedTime desc" }));
          for (const [i, f] of files.entries()) {
            const tabs = i < 8 ? await exec(ctx, "GOOGLESHEETS_GET_SHEET_NAMES", { spreadsheet_id: f.id }).catch(() => ({}) as Record<string, unknown>) : {};
            const names = (Array.isArray(tabs.sheet_names) ? tabs.sheet_names : []) as string[];
            add({ kind: "spreadsheet", id: String(f.id), name: redact(f.name, 80), fields: names.slice(0, 20).map((n) => redact(n, 60)), updatedAt: iso(f.modifiedTime) });
          }
        });
        break;
      case "googledrive":
        await step("shared drives", async () => {
          for (const d of firstList(await exec(ctx, "GOOGLEDRIVE_LIST_SHARED_DRIVES", {}))) add({ kind: "shared drive", id: String(d.id), name: redact(d.name, 80) });
        });
        break;
      case "slack":
        await step("channels", async () => {
          const channels = arr((await exec(ctx, "SLACK_LIST_ALL_CHANNELS", { limit: 200, exclude_archived: true, types: "public_channel" })).channels);
          for (const c of channels.sort((a, b) => Number(b.num_members ?? 0) - Number(a.num_members ?? 0)).slice(0, 40))
            add({ kind: "channel", id: String(c.id), name: `#${c.name}`, count: Number(c.num_members ?? 0) });
        });
        break;
      case "hubspot":
        for (const objectType of ["deals", "tickets"])
          await step(`${objectType} pipelines`, async () => {
            for (const p of firstList(await exec(ctx, "HUBSPOT_RETRIEVE_ALL_PIPELINES_FOR_SPECIFIED_OBJECT_TYPE", { objectType })))
              add({ kind: `${objectType.slice(0, -1)} pipeline`, id: String(p.id), name: redact(p.label, 80), fields: arr(p.stages).map((s) => redact(s.label, 60)) });
          });
        break;
      case "stripe":
        await step("the account", async () => {
          const a = await exec(ctx, "STRIPE_GET_ACCOUNT", {});
          add({ kind: "account", id: String(a.id ?? "account"), name: "Stripe account", meta: { country: String(a.country ?? ""), currency: String(a.default_currency ?? "").toUpperCase() } });
        });
        await step("products", async () => {
          for (const p of arr((await exec(ctx, "STRIPE_LIST_PRODUCTS", { limit: 50, active: true })).data)) add({ kind: "product", id: String(p.id), name: redact(p.name, 80) });
        });
        break;
    }
    // For every live system: which read actions work, and the fields their records have.
    // Systems with their own reader skip this; it is what the general reader relies on.
    if (!DEDICATED.has(toolkit)) await step("readable records", async () => probeReaders(ctx, toolkit, readers));
  }
  return { version: 1, takenAt: (ctx.now ?? new Date()).toISOString(), summary: summarize(resources, readers, notes), resources, readers, notes };
}

// Toolkits read by their own reader in scan.ts.
const DEDICATED = new Set(["gmail", "outlook", "googlecalendar", "googledrive", "googlebigquery", "googleads", "notion", "zendesk", "stripe", "slack", "microsoft_teams"]);

type Add = (r: InventoryResource) => unknown;
type Step = (what: string, fn: () => Promise<void>) => Promise<void>;

async function bigQuery(ctx: ScanContext, add: Add, step: Step) {
  let projects: string[] = [];
  await step("projects", async () => {
    projects = bqProjects(await exec(ctx, "GOOGLEBIGQUERY_LIST_PROJECTS", { max_results: 50 })).slice(0, 10);
    for (const p of projects) add({ kind: "project", id: p, name: p });
  });
  for (const project_id of projects) {
    const locations = new Set<string>();
    await step(`datasets in ${project_id}`, async () => {
      for (const d of arr((await exec(ctx, "GOOGLEBIGQUERY_LIST_DATASETS", { project_id, max_results: 200 })).datasets)) {
        const ref = (d.datasetReference ?? {}) as { datasetId?: string };
        const id =
          ref.datasetId ??
          String(d.id ?? "")
            .split(":")
            .pop();
        if (!id) continue;
        const location = String(d.location ?? "US");
        locations.add(location);
        add({ kind: "dataset", id: `${project_id}.${id}`, name: id, parent: project_id, location });
      }
    });
    for (const location of [...locations].slice(0, 4)) {
      const region = bqRegion(location);
      const rows = async (query: string, names: string[]) => arr((await exec(ctx, "GOOGLEBIGQUERY_QUERY", { project_id, location, query })).rows).map((r) => bqRow(r, names));
      await step(`tables in ${project_id} (${location})`, async () => {
        const [tables, columns] = await Promise.all([
          rows(
            `SELECT table_schema, table_name, total_rows, storage_last_modified_time FROM \`${project_id}\`.\`${region}\`.INFORMATION_SCHEMA.TABLE_STORAGE WHERE deleted = FALSE ORDER BY storage_last_modified_time DESC LIMIT 300`,
            ["table_schema", "table_name", "total_rows", "storage_last_modified_time"],
          ),
          rows(
            `SELECT table_schema, table_name, STRING_AGG(CONCAT(column_name, ' ', data_type), ', ' ORDER BY ordinal_position LIMIT 40) AS columns FROM \`${project_id}\`.\`${region}\`.INFORMATION_SCHEMA.COLUMNS GROUP BY table_schema, table_name LIMIT 600`,
            ["table_schema", "table_name", "columns"],
          ).catch(() => [] as Array<Record<string, unknown>>),
        ]);
        const cols = new Map(columns.map((c) => [`${c.table_schema}.${c.table_name}`, String(c.columns ?? "")]));
        for (const t of tables) {
          const name = `${t.table_schema}.${t.table_name}`;
          add({
            kind: "table",
            id: `${project_id}.${name}`,
            name,
            parent: project_id,
            location,
            count: Number(t.total_rows ?? 0),
            updatedAt: iso(t.storage_last_modified_time),
            fields: (cols.get(name) ?? "")
              .split(", ")
              .filter(Boolean)
              .map((f) => f.slice(0, 80)),
          });
        }
      });
    }
  }
}

async function googleAds(ctx: ScanContext, add: Add, step: Step) {
  let ids: string[] = [];
  await step("ad accounts", async () => {
    ids = adsCustomerIds(await exec(ctx, "GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS", {})).slice(0, 10);
  });
  const seen = new Set<string>();
  for (const id of ids) {
    await step(`ad account ${id}`, async () => {
      const d = await exec(ctx, "GOOGLEADS_SEARCH_STREAM_GAQL", {
        customer_id: id,
        query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1",
      });
      const row = (arr(d.results).length ? arr(d.results) : firstList(d))[0] ?? {};
      const manager = adsField(row, "customer.manager") === true;
      const name = redact(adsField(row, "customer.descriptive_name") ?? id, 80);
      if (!manager) {
        if (!seen.has(id))
          add({ kind: "ad account", id, name, meta: { currency: String(adsField(row, "customer.currency_code") ?? ""), timezone: String(adsField(row, "customer.time_zone") ?? "") } });
        seen.add(id);
        return;
      }
      // A manager account holds no campaigns itself: keep the accounts under it.
      add({ kind: "manager account", id, name });
      for (const s of firstList(await exec(ctx, "GOOGLEADS_LIST_SUB_ACCOUNTS", { customer_id: id }))) {
        const sub = String(s.customer_id ?? s.id ?? "").replace(/\D/g, "");
        if (!sub || seen.has(sub) || s.manager === true) continue;
        seen.add(sub);
        add({ kind: "ad account", id: sub, name: redact(s.descriptive_name ?? s.name ?? sub, 80), parent: id, meta: { currency: String(s.currency_code ?? "") } });
      }
    });
  }
}

// Tries the likeliest read actions with a small page and keeps the ones that return records.
async function probeReaders(ctx: ScanContext, toolkit: string, out: InventoryReader[]) {
  const since = new Date((ctx.now ?? new Date()).getTime() - 30 * 86_400_000).toISOString();
  for (const r of genericCandidates(await readOnlyTools(toolkit), 8)) {
    if (out.length >= 4) break;
    try {
      const rows = firstList(await exec(ctx, r.slug, readerArgs(r, since, 5), r.version));
      if (rows.length) out.push({ ...r, fields: Object.keys(rows[0]!).slice(0, 30) });
    } catch {
      // Not readable without more input; the next candidate may be.
    }
  }
}

const PLURAL: Record<string, string> = { mailbox: "mailbox", "sample data": "sample data", "shared drive": "shared drives", "manager account": "manager accounts" };
function summarize(resources: InventoryResource[], readers: InventoryReader[], notes: string[]): string {
  const counts = new Map<string, number>();
  for (const r of resources) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  const parts = [...counts].filter(([k]) => k !== "mailbox").map(([k, n]) => `${n} ${n === 1 ? k : (PLURAL[k] ?? `${k}s`)}`);
  if (readers.length) parts.push(`${readers.length} kind${readers.length === 1 ? "" : "s"} of record readable`);
  if (parts.length) return parts.join(", ");
  return notes.length ? "Nothing could be listed yet." : "Connected; nothing to list.";
}

// The inventory for prompts: what the system holds, without ids.
export function describeInventory(inv: SystemInventory, name: string, maxChars = 5000): string {
  const lines = [`${name} holds: ${inv.summary}.`];
  const byKind = new Map<string, InventoryResource[]>();
  for (const r of inv.resources) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  for (const [kind, rs] of byKind) {
    const shown = rs.slice(0, kind === "table" ? 60 : 25).map((r) => {
      const bits = [
        r.count !== undefined ? `${r.count.toLocaleString("en")}${kind === "table" ? " rows" : ""}` : "",
        r.fields?.length ? r.fields.slice(0, 15).join(", ") : "",
        r.meta?.currency ?? "",
      ].filter(Boolean);
      return `${r.name ?? r.id}${bits.length ? ` (${bits.join("; ")})` : ""}`;
    });
    lines.push(`${PLURAL[kind] ?? `${kind}s`}: ${shown.join(" | ")}${rs.length > shown.length ? ` | and ${rs.length - shown.length} more` : ""}`);
  }
  for (const r of inv.readers) lines.push(`records from ${r.slug.toLowerCase().replaceAll("_", " ")}: fields ${r.fields.slice(0, 20).join(", ")}`);
  const text = lines.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

export function isInventory(v: unknown): v is SystemInventory {
  return Boolean(v) && typeof v === "object" && (v as { version?: unknown }).version === 1 && Array.isArray((v as { resources?: unknown }).resources);
}
