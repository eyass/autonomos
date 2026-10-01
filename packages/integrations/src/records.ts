import { readOnlyTools, toolkitFor } from "./directory";
import type { InventoryReader } from "./inventory";
import type { SandboxRecord } from "./providers";
import { arr, exec, firstList, genericCandidates, genericItem, iso, readerArgs, redact, type ScanContext } from "./scan";

// The newest records of a connected system (tickets, conversations, emails, deals, issues),
// newest first. One reader serves two things: the "new record" trigger, which starts a run for
// each record it has not seen, and the test panel, which lets a person test on a real one.

export type RecentRecord = {
  id: string;
  // What one record is called, singular: "ticket", "email", "issue".
  kind: string;
  title: string;
  date: string | null;
  record: Record<string, unknown>;
};

export type RecentRecords = { records: RecentRecord[]; source: string | null; unsupported?: string };

type Read = { slug: string; args: Record<string, unknown>; kind: string; rows?: (d: Record<string, unknown>) => Array<Record<string, unknown>>; version?: string | null };

// Popular systems, read newest first. Any other system uses the read actions its inventory found.
function knownRead(toolkit: string, max: number): Read | null {
  switch (toolkit) {
    case "zendesk":
      return { slug: "ZENDESK_LIST_ZENDESK_TICKETS", args: { per_page: max, sort_by: "created_at", sort_order: "desc" }, kind: "ticket", rows: (d) => arr(d.tickets ?? d.data) };
    case "freshdesk":
      // Freshdesk lists newest first by default; through Composio its sort and since parameters fail.
      return { slug: "FRESHDESK_GET_TICKETS", args: { per_page: max }, kind: "ticket" };
    case "intercom":
      return { slug: "INTERCOM_LIST_CONVERSATIONS", args: { per_page: max }, kind: "conversation" };
    case "hubspot":
      return { slug: "HUBSPOT_LIST_TICKETS", args: { limit: max, properties: ["subject", "content", "hs_pipeline_stage", "createdate"] }, kind: "ticket" };
    case "jira":
      return { slug: "JIRA_SEARCH_FOR_ISSUES_USING_JQL_GET", args: { jql: "ORDER BY created DESC", max_results: max, fields: "summary,status,issuetype,created" }, kind: "issue" };
    case "salesforce":
      return {
        slug: "SALESFORCE_EXECUTE_SOQL_QUERY",
        args: { soql_query: `SELECT Id, CaseNumber, Subject, Status, Origin, CreatedDate FROM Case ORDER BY CreatedDate DESC LIMIT ${max}` },
        kind: "case",
      };
    case "gmail":
      return {
        slug: "GMAIL_FETCH_EMAILS",
        args: { query: "in:inbox -category:promotions -category:social", max_results: max, include_payload: false, verbose: false },
        kind: "email",
        rows: (d) =>
          arr(d.messages).map((m) => ({
            id: m.messageId ?? m.id,
            thread_id: m.threadId,
            subject: m.subject,
            from: m.sender ?? m.from,
            snippet: (m.preview as { body?: string } | undefined)?.body ?? m.snippet,
            received_at: iso(m.messageTimestamp ?? m.internalDate),
          })),
      };
    case "outlook":
      return { slug: "OUTLOOK_OUTLOOK_LIST_MESSAGES", args: { top: max }, kind: "email", rows: (d) => (arr(d.value).length ? arr(d.value) : firstList(d)) };
    case "stripe":
      return { slug: "STRIPE_LIST_CHARGES", args: { limit: max }, kind: "payment", rows: (d) => arr(d.data) };
    default:
      return null;
  }
}

const KINDS: Array<[RegExp, string]> = [
  [/TICKET/, "ticket"],
  [/CONVERSATION/, "conversation"],
  [/(EMAIL|MESSAGE)/, "message"],
  [/ISSUE/, "issue"],
  [/DEAL|OPPORTUNIT/, "deal"],
  [/LEAD/, "lead"],
  [/ORDER/, "order"],
  [/INVOICE/, "invoice"],
  [/(PAYMENT|CHARGE|TRANSACTION)/, "payment"],
  [/(BOOKING|APPOINTMENT)/, "booking"],
  [/TASK/, "task"],
  [/CASE/, "case"],
  [/(SUBMISSION|RESPONSE)/, "submission"],
];
export const kindOf = (slug: string) => KINDS.find(([re]) => re.test(slug))?.[1] ?? "record";

const ID_FIELDS = ["id", "Id", "ID", "ticket_id", "messageId", "message_id", "key", "uuid", "number", "CaseNumber"];
const DATE_FIELDS = ["created_at", "createdAt", "CreatedDate", "createdate", "created", "received_at", "receivedDateTime", "date", "updated_at", "updatedAt", "timestamp"];

function field(o: Record<string, unknown>, names: string[]): string | number | undefined {
  const nests = [o, o.properties, o.fields].filter((n): n is Record<string, unknown> => Boolean(n) && typeof n === "object");
  for (const name of names) for (const n of nests) if (typeof n[name] === "string" || typeof n[name] === "number") return n[name] as string | number;
  return undefined;
}

// The record as an agent receives it: plain fields only, long text shortened, HTML removed.
export function compactRecord(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const add = (k: string, v: unknown) => {
    if (Object.keys(out).length >= 30 || v === null || v === undefined || v === "") return;
    if (typeof v === "string")
      out[k] = v
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 600);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === "string" || typeof x === "number")) out[k] = v.slice(0, 10);
  };
  for (const [k, v] of Object.entries(o)) add(k, v);
  for (const nest of ["properties", "fields"]) {
    const n = o[nest];
    if (n && typeof n === "object" && !Array.isArray(n)) for (const [k, v] of Object.entries(n)) if (!(k in out)) add(k, v);
  }
  return out;
}

export function toRecentRecord(o: Record<string, unknown>, kind: string): RecentRecord | null {
  const id = field(o, ID_FIELDS);
  if (id === undefined) return null;
  const title = genericItem(o)?.title ?? `${kind[0]!.toUpperCase()}${kind.slice(1)} ${id}`;
  const raw = field(o, DATE_FIELDS);
  return { id: String(id), kind, title: redact(title, 140), date: iso(raw), record: compactRecord(o) };
}

const newestFirst = (a: RecentRecord, b: RecentRecord) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0);

export async function recentRecords(integration: string, ctx: ScanContext, max = 20): Promise<RecentRecords> {
  if (ctx.connection.provider === "sandbox") return sandboxRecords(integration, ctx, max);
  const toolkit = toolkitFor(integration);
  const reads: Read[] = [];
  const known = knownRead(toolkit, max);
  if (known) reads.push(known);
  // Readers the inventory found working, then candidates from the catalogue.
  let readers: InventoryReader[] = (ctx.inventory?.readers ?? []).filter((r) => r.version !== "00000000_00");
  if (!readers.length && !known) readers = genericCandidates(await readOnlyTools(toolkit).catch(() => []));
  for (const r of readers) reads.push({ slug: r.slug, args: readerArgs(r, new Date(Date.now() - 30 * 86_400_000).toISOString(), max), kind: kindOf(r.slug), version: r.version });
  for (const r of reads) {
    try {
      const d = await exec(ctx, r.slug, r.args, r.version);
      const records = (r.rows ? r.rows(d) : firstList(d))
        .map((o) => toRecentRecord(o, r.kind))
        .filter((x): x is RecentRecord => Boolean(x))
        .sort(newestFirst)
        .slice(0, max);
      if (records.length) return { records, source: r.slug };
    } catch (e) {
      console.error("recent records read failed", integration, r.slug, e);
    }
  }
  return { records: [], source: null, unsupported: reads.length ? "No records came back from this system." : "Records from this system cannot be read yet." };
}

async function sandboxRecords(integration: string, ctx: ScanContext, max: number): Promise<RecentRecords> {
  const kinds: Record<string, [string, string]> = { zendesk: ["ticket", "ticket"], gmail: ["message", "email"], slack: ["message", "message"], stripe: ["payment", "payment"] };
  const k = kinds[integration];
  if (!k) return { records: [], source: null, unsupported: "This sandbox holds no records." };
  const rows = (await ctx.sandbox.list(integration, k[0])) as SandboxRecord[];
  // Tickets a test run made are not real work, so no live run ever starts on one.
  const records = rows
    .filter((o) => (o as { test?: boolean }).test !== true)
    .map((o) => toRecentRecord(o as Record<string, unknown>, k[1]))
    .filter((x): x is RecentRecord => Boolean(x))
    .sort(newestFirst)
    .slice(0, max);
  return { records, source: "sandbox" };
}

// The input a run receives for one record, the same for the trigger and for a test.
export function recordInput(integration: string, r: RecentRecord): Record<string, unknown> {
  return { source: integration, record_kind: r.kind, record_id: r.id, [`${r.kind}_id`]: r.id, title: r.title, created_at: r.date, record: r.record };
}
