import { ToolError } from "./errors";
import { readOnlyTools, toolkitFor } from "./directory";
import { getComposio, type ConnectionInfo, type SandboxRecord, type SandboxStore } from "./providers";

// Reads a recent sample of real data from a connected system so discovery can propose the
// work it shows. Only what is needed to recognise recurring work is kept: subjects, short
// snippets, tags, dates and amounts. Personal details are redacted before anything leaves
// this function (email addresses become their domain, phone and card-like numbers go).

export type ScanItem = { title: string; detail?: string; date?: string | null; labels?: string[]; amount?: number; from?: string | null };

export type SystemScan = {
  integration: string;
  provider: "sandbox" | "composio";
  // What was read, in plain words, e.g. "emails" or "tickets".
  itemKind: string;
  sampled: number;
  periodDays: number | null;
  stats: Record<string, string | number>;
  items: ScanItem[];
  // How many records the system holds in the window, when it says (the sample can be smaller).
  estimatedTotal?: number;
  // Set when the system cannot be read yet; discovery continues without it.
  unsupported?: string;
};

export type ScanContext = { organizationId: string; connection: ConnectionInfo; sandbox: SandboxStore; now?: Date };

// Sandbox systems that have data to read. Live accounts: every Composio toolkit can be read,
// with a dedicated reader for the common ones and a general reader for the rest.
export const SCANNABLE = ["zendesk", "gmail", "stripe", "slack"];

// How far back discovery reads, and how much. A month is enough to see recurring work; the
// item cap keeps prompts and API calls bounded.
export type ScanLimit = { days: number; max: number };
export const SCAN_LIMITS: Record<string, ScanLimit> = {
  gmail: { days: 30, max: 250 },
  outlook: { days: 30, max: 250 },
  googlecalendar: { days: 30, max: 250 },
  zendesk: { days: 30, max: 100 },
  stripe: { days: 30, max: 100 },
  slack: { days: 30, max: 150 },
  microsoft_teams: { days: 30, max: 100 },
  hubspot: { days: 30, max: 100 },
  salesforce: { days: 30, max: 100 },
  intercom: { days: 30, max: 100 },
  jira: { days: 30, max: 100 },
  asana: { days: 30, max: 100 },
  notion: { days: 30, max: 100 },
  googledrive: { days: 30, max: 150 },
};
export const DEFAULT_SCAN_LIMIT: ScanLimit = { days: 30, max: 50 };
export const scanLimitFor = (integration: string): ScanLimit => SCAN_LIMITS[toolkitFor(integration)] ?? DEFAULT_SCAN_LIMIT;

export function redact(text: unknown, max = 220): string {
  return String(text ?? "")
    .replace(/[\w.+-]+@([\w-]+\.[\w.-]+)/g, (_m, domain: string) => `[someone@${domain}]`)
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, "[iban]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const domainOf = (from: unknown) => {
  const m = String(from ?? "").match(/@([\w-]+\.[\w.-]+)/);
  return m ? m[1]!.toLowerCase() : null;
};

function periodDays(dates: Array<string | null | undefined>, now: Date): number | null {
  const times = dates.map((d) => (d ? Date.parse(d) : NaN)).filter((t) => Number.isFinite(t));
  if (!times.length) return null;
  return Math.max(1, Math.round((now.getTime() - Math.min(...times)) / 86_400_000));
}

function top(values: string[], n = 6): string {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Shaping: one function per kind of data turns raw records into a SystemScan.
// Every shaper keeps only records inside the lookback window, newest first, up to the cap.
// ---------------------------------------------------------------------------

function within<T extends Record<string, unknown>>(rows: T[], field: string, limit: ScanLimit, now: Date): T[] {
  const since = now.getTime() - limit.days * 86_400_000;
  return rows
    .filter((r) => {
      const t = Date.parse(String(r[field] ?? ""));
      return !Number.isFinite(t) || t >= since;
    })
    .sort((a, b) => String(b[field] ?? "").localeCompare(String(a[field] ?? "")))
    .slice(0, limit.max);
}

function ticketsScan(integration: string, provider: SystemScan["provider"], raw: Array<Record<string, unknown>>, limit: ScanLimit, now: Date): SystemScan {
  const tickets = within(raw, "created_at", limit, now);
  const items = tickets.map((t) => ({
    title: redact(t.subject, 140),
    detail: redact(t.description, 160),
    date: (t.created_at as string) ?? null,
    labels: ((t.tags as string[]) ?? []).slice(0, 6),
  }));
  return {
    integration,
    provider,
    itemKind: "tickets",
    sampled: items.length,
    periodDays: periodDays(
      items.map((i) => i.date),
      now,
    ),
    stats: { tickets: items.length, top_tags: top(items.flatMap((i) => i.labels ?? [])), open: tickets.filter((t) => ["new", "open", "pending"].includes(String(t.status))).length },
    items,
  };
}

function emailsScan(integration: string, provider: SystemScan["provider"], raw: Array<Record<string, unknown>>, limit: ScanLimit, now: Date): SystemScan {
  const items = within(raw, "received_at", limit, now).map((m) => ({
    title: redact(m.subject, 140),
    detail: redact(m.snippet, 160),
    date: (m.received_at as string) ?? null,
    from: domainOf(m.from),
    labels: ((m.labels as string[]) ?? []).filter((l) => !/^(UNREAD|IMPORTANT|CATEGORY_PERSONAL)$/.test(l)).slice(0, 4),
  }));
  return {
    integration,
    provider,
    itemKind: "emails",
    sampled: items.length,
    periodDays: periodDays(
      items.map((i) => i.date),
      now,
    ),
    stats: { emails: items.length, top_sender_domains: top(items.map((i) => i.from ?? "")) },
    items,
  };
}

function eventsScan(integration: string, provider: SystemScan["provider"], raw: Array<Record<string, unknown>>, limit: ScanLimit, now: Date): SystemScan {
  const items = within(raw, "start", limit, now).map((e) => ({
    title: redact(e.summary ?? "Event", 140),
    detail: redact(e.description, 120),
    date: (e.start as string) ?? null,
    labels: e.recurring ? ["recurring"] : [],
  }));
  return {
    integration,
    provider,
    itemKind: "calendar events",
    sampled: items.length,
    periodDays: periodDays(
      items.map((i) => i.date),
      now,
    ),
    stats: {
      events: items.length,
      recurring: items.filter((i) => i.labels.length).length,
      most_common: top(
        items.map((i) => i.title),
        5,
      ),
    },
    items,
  };
}

function paymentsScan(provider: SystemScan["provider"], rawPayments: Array<Record<string, unknown>>, rawRefunds: Array<Record<string, unknown>>, limit: ScanLimit, now: Date): SystemScan {
  const payments = within(rawPayments, "created_at", limit, now);
  const refunds = within(rawRefunds, "created_at", limit, now);
  const items: ScanItem[] = [
    ...refunds.map((r) => ({
      title: `Refund ${r.reason ? `(${String(r.reason).replaceAll("_", " ")})` : ""}`.trim(),
      amount: Number(r.amount ?? 0),
      date: (r.created_at as string) ?? null,
      labels: ["refund"],
    })),
    ...payments.map((p) => ({ title: redact(p.description ?? "Payment", 100), amount: Number(p.amount ?? 0), date: (p.created_at as string) ?? null, labels: [String(p.status ?? "succeeded")] })),
  ].slice(0, limit.max);
  const volume = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  return {
    integration: "stripe",
    provider,
    itemKind: "payments and refunds",
    sampled: payments.length + refunds.length,
    periodDays: periodDays(
      items.map((i) => i.date),
      now,
    ),
    stats: {
      payments: payments.length,
      refunds: refunds.length,
      refund_rate: payments.length ? `${Math.round((refunds.length / payments.length) * 100)}%` : "n/a",
      failed_payments: payments.filter((p) => String(p.status) === "failed").length,
      payment_volume: Math.round(volume),
    },
    items,
  };
}

function chatScan(integration: string, provider: SystemScan["provider"], raw: Array<Record<string, unknown>>, limit: ScanLimit, now: Date): SystemScan {
  const items = within(raw, "posted_at", limit, now).map((m) => ({ title: redact(m.text, 180), labels: [String(m.channel ?? "")], date: (m.posted_at as string) ?? null }));
  return {
    integration,
    provider,
    itemKind: "messages",
    sampled: items.length,
    periodDays: periodDays(
      items.map((i) => i.date),
      now,
    ),
    stats: { messages: items.length, channels: top(items.map((i) => i.labels[0] ?? "")) },
    items,
  };
}

function recordsScan(integration: string, raw: Array<Record<string, unknown>>, limit: ScanLimit, now: Date, itemKind = "records"): SystemScan {
  const since = now.getTime() - limit.days * 86_400_000;
  const items = raw
    .map(genericItem)
    .filter((i): i is ScanItem => Boolean(i) && (!i!.date || Date.parse(i!.date) >= since))
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))
    .slice(0, limit.max);
  return {
    integration,
    provider: "composio",
    itemKind,
    sampled: items.length,
    periodDays: periodDays(
      items.map((i) => i.date),
      now,
    ),
    stats: { [itemKind]: items.length, top_labels: top(items.flatMap((i) => i.labels ?? [])) },
    items,
  };
}

// The window is what was read, even when the newest records are the only ones sampled.
function withTotal(scan: SystemScan, total: number): SystemScan {
  return total > scan.sampled ? { ...scan, estimatedTotal: total, stats: { ...scan.stats, total_in_window: total } } : scan;
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

export async function scanSystem(integration: string, ctx: ScanContext): Promise<SystemScan> {
  const now = ctx.now ?? new Date();
  const provider = ctx.connection.provider;
  const limit = scanLimitFor(integration);
  if (provider === "sandbox") {
    if (!SCANNABLE.includes(integration)) {
      return { integration, provider, itemKind: "records", sampled: 0, periodDays: null, stats: {}, items: [], unsupported: "This sandbox has no data to read." };
    }
    return scanSandbox(integration, ctx.sandbox, limit, now);
  }
  return scanComposio(integration, ctx, limit, now);
}

async function scanSandbox(integration: string, s: SandboxStore, limit: ScanLimit, now: Date): Promise<SystemScan> {
  const rows = async (system: string, kind: string) => (await s.list(system, kind)) as SandboxRecord[];
  if (integration === "zendesk") return ticketsScan("zendesk", "sandbox", await rows("zendesk", "ticket"), limit, now);
  if (integration === "gmail") return emailsScan("gmail", "sandbox", await rows("gmail", "message"), limit, now);
  if (integration === "slack") return chatScan("slack", "sandbox", await rows("slack", "message"), limit, now);
  const [payments, refunds] = await Promise.all([rows("stripe", "payment"), rows("stripe", "refund")]);
  return paymentsScan("sandbox", payments, refunds, limit, now);
}

// Toolkits whose versions are pinned in the Composio client; others are read with the
// version the tool catalogue reports (reads only, so a newer version is safe).
const PINNED = new Set(["zendesk", "stripe", "slack", "gmail"]);

async function exec(ctx: ScanContext, slug: string, args: Record<string, unknown>, version?: string | null): Promise<Record<string, unknown>> {
  if (!ctx.connection.externalAccountId) throw new ToolError("not_connected", "No connected account");
  const toolkit = toolkitFor(ctx.connection.integration);
  const r = (await getComposio().tools.execute(slug, {
    userId: ctx.organizationId,
    connectedAccountId: ctx.connection.externalAccountId,
    arguments: args,
    ...(PINNED.has(toolkit) ? {} : version && version !== "00000000_00" ? { version } : { dangerouslySkipVersionCheck: true }),
  })) as {
    successful?: boolean;
    error?: string | null;
    data?: unknown;
  };
  if (r.successful === false) throw new ToolError("invalid_data", r.error ?? `${slug} failed`);
  let d = (r.data ?? {}) as Record<string, unknown>;
  // Composio sometimes wraps the upstream payload once more.
  if (d.response_data && typeof d.response_data === "object") d = d.response_data as Record<string, unknown>;
  return d;
}

const arr = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []);
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "object") {
    const o = v as { dateTime?: unknown; date?: unknown };
    return iso(o.dateTime ?? o.date);
  }
  const n = Number(v);
  if (Number.isFinite(n)) return new Date(n > 1e12 ? n : n * 1000).toISOString();
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

// The first non-empty array of objects in a response, however deeply Composio wraps it.
function firstList(d: unknown, depth = 0): Array<Record<string, unknown>> {
  if (Array.isArray(d)) return d.length && typeof d[0] === "object" && d[0] !== null ? (d as Array<Record<string, unknown>>) : [];
  if (!d || typeof d !== "object" || depth > 3) return [];
  for (const v of Object.values(d as Record<string, unknown>)) {
    const found = firstList(v, depth + 1);
    if (found.length) return found;
  }
  return [];
}

// Equal slices of the lookback window, newest first. Reading a few records from each slice
// covers the whole window, where "newest N" on a busy account covers only its last days.
export function windowSlices(now: Date, days: number, n: number): Array<{ from: Date; to: Date }> {
  const span = (days * 86_400_000) / n;
  return Array.from({ length: n }, (_, i) => ({ from: new Date(now.getTime() - (i + 1) * span), to: new Date(now.getTime() - i * span) }));
}
const SLICES = 5;
const sec = (d: Date) => Math.floor(d.getTime() / 1000);

// Response fields that point at the next page, and the argument names tools take them in.
const NEXT_FIELDS = ["nextPageToken", "next_page_token", "next_cursor", "nextCursor", "cursor"];
const TOKEN_PARAMS = ["page_token", "pageToken", "start_cursor", "cursor", "next_page_token", "after"];
function nextToken(d: Record<string, unknown>): string | null {
  for (const f of NEXT_FIELDS) if (typeof d[f] === "string" && d[f]) return d[f] as string;
  const after = (d.paging as { next?: { after?: unknown } } | undefined)?.next?.after;
  return typeof after === "string" && after ? after : null;
}

// Calls a list action page by page until it has `max` rows or the pages run out.
async function paged(
  ctx: ScanContext,
  slug: string,
  args: Record<string, unknown>,
  tokenParam: string | null,
  max: number,
  rows: (d: Record<string, unknown>) => Array<Record<string, unknown>>,
  version?: string | null,
) {
  const out: Array<Record<string, unknown>> = [];
  let token: string | null = null;
  for (let page = 0; page < 10 && out.length < max; page++) {
    const d = await exec(ctx, slug, token && tokenParam ? { ...args, [tokenParam]: token } : args, version);
    out.push(...rows(d));
    token = nextToken(d);
    if (!token || !tokenParam) break;
  }
  return out.slice(0, max);
}

async function scanComposio(integration: string, ctx: ScanContext, limit: ScanLimit, now: Date): Promise<SystemScan> {
  const toolkit = toolkitFor(integration);
  const sinceMs = now.getTime() - limit.days * 86_400_000;
  const sinceSec = Math.floor(sinceMs / 1000);
  if (toolkit === "gmail") {
    // A few messages from each slice of the month, and Gmail's own count of the rest.
    const slices = windowSlices(now, limit.days, SLICES);
    const per = Math.ceil(limit.max / slices.length);
    const pages = await Promise.all(
      slices.map((w) =>
        exec(ctx, "GMAIL_FETCH_EMAILS", { query: `after:${sec(w.from)} before:${sec(w.to)} -category:promotions -category:social`, max_results: per, include_payload: false, verbose: false }),
      ),
    );
    const messages = pages.flatMap((d) =>
      arr(d.messages).map((m) => ({
        subject: m.subject,
        snippet: (m.preview as { body?: string } | undefined)?.body ?? m.snippet ?? m.messageText,
        from: m.sender ?? m.from,
        labels: m.labelIds,
        received_at: iso(m.messageTimestamp ?? m.internalDate),
      })),
    );
    const total = pages.reduce((n, d) => n + Math.max(Number(d.resultSizeEstimate ?? 0), arr(d.messages).length), 0);
    return withTotal(emailsScan(integration, "composio", messages, limit, now), total);
  }
  if (toolkit === "outlook") {
    const slices = windowSlices(now, limit.days, SLICES);
    const per = Math.ceil(limit.max / slices.length);
    const pages = await Promise.all(
      slices.map((w) => exec(ctx, "OUTLOOK_OUTLOOK_LIST_MESSAGES", { top: per, received_date_time_ge: w.from.toISOString(), received_date_time_lt: w.to.toISOString() })),
    );
    const messages = pages.flatMap((d) =>
      (arr(d.value).length ? arr(d.value) : firstList(d)).map((m) => ({
        subject: m.subject,
        snippet: m.bodyPreview,
        from: (m.from as { emailAddress?: { address?: string } } | undefined)?.emailAddress?.address,
        labels: m.categories,
        received_at: iso(m.receivedDateTime),
      })),
    );
    return emailsScan(integration, "composio", messages, limit, now);
  }
  if (toolkit === "googlecalendar") {
    // Every event of the last 30 days on the main calendar, recurring ones expanded.
    const events = (
      await paged(
        ctx,
        "GOOGLECALENDAR_EVENTS_LIST",
        { calendarId: "primary", timeMin: new Date(sinceMs).toISOString(), timeMax: now.toISOString(), singleEvents: true, orderBy: "startTime", maxResults: Math.min(250, limit.max) },
        "pageToken",
        limit.max * 4,
        (d) => arr(d.items),
      )
    )
      .filter((e) => e.status !== "cancelled")
      .map((e) => ({ summary: e.summary, description: e.description, start: iso(e.start), recurring: Boolean(e.recurringEventId) }));
    return withTotal(eventsScan(integration, "composio", events, limit, now), events.length);
  }
  if (toolkit === "googledrive") {
    const slices = windowSlices(now, limit.days, SLICES);
    const per = Math.ceil(limit.max / slices.length);
    const pages = await Promise.all(
      slices.map((w) =>
        exec(ctx, "GOOGLEDRIVE_LIST_FILES", {
          q: `modifiedTime > '${w.from.toISOString()}' and modifiedTime <= '${w.to.toISOString()}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
          orderBy: "modifiedTime desc",
          pageSize: per,
          fields: "nextPageToken,files(name,mimeType,modifiedTime,createdTime)",
        }),
      ),
    );
    return recordsScan(
      integration,
      pages.flatMap((d) => arr(d.files)),
      limit,
      now,
      "files",
    );
  }
  if (toolkit === "notion") {
    // Pages edited most recently first, until the window or the cap runs out.
    const since = sinceMs;
    const pages = await paged(ctx, "NOTION_SEARCH_NOTION_PAGE", { query: "", page_size: 100, timestamp: "last_edited_time", direction: "descending" }, "start_cursor", limit.max, (d) =>
      firstList(d).filter((p) => Date.parse(String(p.last_edited_time ?? "")) >= since || !p.last_edited_time),
    );
    return recordsScan(integration, pages, limit, now, "pages");
  }
  if (toolkit === "zendesk") {
    const d = await exec(ctx, "ZENDESK_LIST_ZENDESK_TICKETS", { per_page: limit.max, sort_by: "created_at", sort_order: "desc" });
    return ticketsScan(integration, "composio", arr(d.tickets ?? d.data), limit, now);
  }
  if (toolkit === "stripe") {
    // Last 30 days, or the last 100 charges if there are more.
    const [charges, refunds] = await Promise.all([exec(ctx, "STRIPE_LIST_CHARGES", { limit: limit.max, created: { gte: sinceSec } }), exec(ctx, "STRIPE_LIST_REFUNDS", { limit: limit.max })]);
    const minor = (v: unknown) => Number(v ?? 0) / 100;
    return paymentsScan(
      "composio",
      arr(charges.data).map((c) => ({ amount: minor(c.amount), description: c.description, status: c.status, created_at: iso(c.created) })),
      arr(refunds.data).map((r) => ({ amount: minor(r.amount), reason: r.reason, created_at: iso(r.created) })),
      limit,
      now,
    );
  }
  if (toolkit === "slack") {
    // The busiest public channels, the last 30 days of each.
    const channels = arr((await exec(ctx, "SLACK_LIST_ALL_CHANNELS", { limit: 100, exclude_archived: true, types: "public_channel" })).channels)
      .sort((a, b) => Number(b.num_members ?? 0) - Number(a.num_members ?? 0))
      .slice(0, 6);
    const perChannel = Math.max(10, Math.ceil(limit.max / Math.max(1, channels.length)));
    const messages: Array<Record<string, unknown>> = [];
    for (const c of channels) {
      const h = await exec(ctx, "SLACK_FETCH_CONVERSATION_HISTORY", { channel: c.id, limit: perChannel, oldest: String(sinceSec) }).catch(() => ({}) as Record<string, unknown>);
      for (const m of arr(h.messages)) if (!m.subtype) messages.push({ channel: `#${c.name}`, text: m.text, posted_at: iso(m.ts) });
    }
    return chatScan(integration, "composio", messages, limit, now);
  }
  return scanGeneric(integration, toolkit, ctx, limit, now);
}

// ---------------------------------------------------------------------------
// General reader for any other Composio toolkit: pick up to two read-only "list" actions
// that need no input, call them with the lookback and cap, and keep what looks like work items.
// ---------------------------------------------------------------------------

const LIMIT_PARAMS = ["limit", "max_results", "maxResults", "per_page", "perPage", "page_size", "pageSize", "count", "top", "first"];
const SINCE_PARAMS = [
  "since",
  "after",
  "start_date",
  "startDate",
  "created_after",
  "createdAfter",
  "updated_after",
  "updatedAfter",
  "modified_since",
  "modified_after",
  "timeMin",
  "time_min",
  "from_date",
  "date_from",
  "min_date",
];
const TITLE_FIELDS = ["subject", "Subject", "title", "summary", "dealname", "name", "Name", "text", "subject_line", "message", "snippet", "description", "label"];
const DATE_FIELDS = [
  "created_at",
  "createdAt",
  "created",
  "createdate",
  "CreatedDate",
  "created_time",
  "createdTime",
  "createdDateTime",
  "date",
  "modifiedTime",
  "updated_at",
  "updatedAt",
  "updated",
  "timestamp",
  "ts",
  "start",
  "time",
  "last_edited_time",
  "last_modified",
  "modified_at",
];
const LABEL_FIELDS = ["status", "Status", "state", "type", "stage", "StageName", "dealstage", "hs_pipeline_stage", "Origin", "category", "priority", "pipeline", "kind", "mimeType"];

function pick(o: Record<string, unknown>, fields: string[]): unknown {
  const nests = [o, o.properties, o.fields, o.source].filter((n): n is Record<string, unknown> => Boolean(n) && typeof n === "object");
  for (const f of fields) {
    for (const n of nests) {
      let v = n[f];
      // Jira and similar APIs wrap values: { name: "Done" }.
      if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as { name?: unknown }).name === "string") v = (v as { name: string }).name;
      if (v !== undefined && v !== null && v !== "" && typeof v !== "object") return v;
    }
  }
  return undefined;
}

// Notion keeps a page's title in whichever property has type "title".
function notionTitle(o: Record<string, unknown>): string | undefined {
  const props = o.properties;
  if (!props || typeof props !== "object") return undefined;
  for (const v of Object.values(props as Record<string, { type?: string; title?: Array<{ plain_text?: string }> }>)) {
    if (v?.type === "title" && Array.isArray(v.title))
      return (
        v.title
          .map((t) => t.plain_text ?? "")
          .join("")
          .trim() || undefined
      );
  }
  return undefined;
}

export function genericItem(o: Record<string, unknown>): ScanItem | null {
  const title = pick(o, TITLE_FIELDS) ?? notionTitle(o);
  if (title === undefined) return null;
  const labels = LABEL_FIELDS.map((f) => pick(o, [f]))
    .filter((v) => typeof v === "string" || typeof v === "number")
    .map((v) => String(v).slice(0, 40))
    .slice(0, 3);
  return { title: redact(String(title).replace(/<[^>]+>/g, " "), 140), date: iso(pick(o, DATE_FIELDS)), labels };
}

type Read = { slug: string; args: Record<string, unknown>; version?: string | null };

// Hand-picked read actions for popular systems without a dedicated reader. Each reads the
// last `days` days (or the newest `max` records) of the work the system holds.
function curatedReads(toolkit: string, sinceIso: string, max: number): Read[] | null {
  const days = Math.round((Date.now() - Date.parse(sinceIso)) / 86_400_000);
  switch (toolkit) {
    case "hubspot":
      return [
        { slug: "HUBSPOT_LIST_TICKETS", args: { limit: max, properties: ["subject", "hs_pipeline_stage", "createdate"] } },
        { slug: "HUBSPOT_HUBSPOT_LIST_DEALS", args: { limit: max, properties: ["dealname", "dealstage", "createdate"] } },
      ];
    case "salesforce":
      return [
        {
          slug: "SALESFORCE_EXECUTE_SOQL_QUERY",
          args: { soql_query: `SELECT Subject, Status, Origin, CreatedDate FROM Case WHERE CreatedDate = LAST_N_DAYS:${days} ORDER BY CreatedDate DESC LIMIT ${max}` },
        },
        {
          slug: "SALESFORCE_EXECUTE_SOQL_QUERY",
          args: { soql_query: `SELECT Name, StageName, CreatedDate FROM Opportunity WHERE CreatedDate = LAST_N_DAYS:${days} ORDER BY CreatedDate DESC LIMIT ${max}` },
        },
      ];
    case "jira":
      return [{ slug: "JIRA_SEARCH_FOR_ISSUES_USING_JQL_GET", args: { jql: `created >= -${days}d ORDER BY created DESC`, max_results: max, fields: "summary,status,issuetype,created" } }];
    case "intercom":
      return [{ slug: "INTERCOM_LIST_CONVERSATIONS", args: { per_page: Math.min(max, 150) } }];
    case "googlesheets":
      return [{ slug: "GOOGLESHEETS_SEARCH_SPREADSHEETS", args: { max_results: max, modified_after: sinceIso } }];
    default:
      return null;
  }
}

// Actions about the work itself rank above actions about configuration.
const WORK =
  /(TICKET|DEAL|CONVERSATION|ISSUE|TASK|MESSAGE|EMAIL|ORDER|INVOICE|EVENT|LEAD|OPPORTUNIT|CASE|POST|COMMENT|RECORD|FILE|CAMPAIGN|PAYMENT|TRANSACTION|BOOKING|APPOINTMENT|REQUEST|SUBMISSION|RESPONSE|NOTE|ACTIVIT)/;
const CONFIG =
  /(ATTACHMENT|DOWNLOAD|FILE_CONTENT|SCHEMA|FIELD|PROPERT|SCOPE|TOKEN|WEBHOOK|SETTING|TEMPLATE|IMPORT|EXPORT|TYPE|USER|ADMIN|MEMBER|ROLE|PERMISSION|LABEL|TAG|FOLDER|WORKSPACE|TEAM|BOARD|BASE|LIST_LISTS|CATEGOR|CURRENC|LOCALE|TIMEZONE|APP)/;

async function scanGeneric(integration: string, toolkit: string, ctx: ScanContext, limit: ScanLimit, now: Date): Promise<SystemScan> {
  const sinceIso = new Date(now.getTime() - limit.days * 86_400_000).toISOString();
  let reads = curatedReads(toolkit, sinceIso, limit.max);
  if (!reads && toolkit === "microsoft_teams") return scanTeams(integration, ctx, limit, now);
  if (!reads) {
    const tools = (await readOnlyTools(toolkit).catch(() => []))
      .filter((t) => t.required.length === 0 && /(LIST|FETCH|SEARCH|GET_ALL|RECENT)/.test(t.slug) && WORK.test(t.slug) && !CONFIG.test(t.slug.replace(/^[A-Z]+_/, "")))
      .sort((a, b) => rank(a.slug) - rank(b.slug))
      .slice(0, 2);
    reads = tools.map((t) => {
      const args: Record<string, unknown> = {};
      const per = Math.ceil(limit.max / Math.max(1, tools.length));
      for (const p of LIMIT_PARAMS) if (t.properties[p]) args[p] = per;
      for (const p of SINCE_PARAMS) {
        if (!t.properties[p]) continue;
        args[p] = t.properties[p].type === "integer" || t.properties[p].type === "number" ? Math.floor(Date.parse(sinceIso) / 1000) : sinceIso;
      }
      return { slug: t.slug, args, version: t.version };
    });
  }
  if (!reads.length) {
    return { integration, provider: "composio", itemKind: "records", sampled: 0, periodDays: null, stats: {}, items: [], unsupported: "AutonomOS cannot read this system for discovery yet." };
  }
  const per = Math.ceil(limit.max / reads.length);
  const meta = await readOnlyTools(toolkit).catch(() => []);
  const items: ScanItem[] = [];
  const used: string[] = [];
  for (const r of reads) {
    try {
      const props = meta.find((t) => t.slug === r.slug)?.properties ?? {};
      const tokenParam = TOKEN_PARAMS.find((p) => props[p]) ?? null;
      const rows = (await paged(ctx, r.slug, r.args, tokenParam, per * 3, (d) => firstList(d), r.version)).map(genericItem).filter((i): i is ScanItem => Boolean(i));
      const recent = rows.filter((i) => !i.date || Date.parse(i.date) >= Date.parse(sinceIso)).slice(0, per);
      if (recent.length) {
        items.push(...recent);
        used.push(`${r.slug.replace(`${toolkit.toUpperCase()}_`, "").replaceAll("_", " ").toLowerCase()} (${recent.length})`);
      }
    } catch (e) {
      console.error("generic scan failed", r.slug, e);
    }
  }
  return {
    integration,
    provider: "composio",
    itemKind: "records",
    sampled: items.length,
    periodDays: periodDays(
      items.map((i) => i.date),
      now,
    ),
    stats: { records: items.length, read_from: used.join(", "), top_labels: top(items.flatMap((i) => i.labels ?? [])) },
    items: items.slice(0, limit.max),
  };
}

// Microsoft Teams: the most recent chats, then the last month of messages in each.
async function scanTeams(integration: string, ctx: ScanContext, limit: ScanLimit, now: Date): Promise<SystemScan> {
  const chats = firstList(await exec(ctx, "MICROSOFT_TEAMS_CHATS_GET_ALL_CHATS", { top: 10 })).slice(0, 6);
  const perChat = Math.max(10, Math.ceil(limit.max / Math.max(1, chats.length)));
  const messages: Array<Record<string, unknown>> = [];
  for (const c of chats) {
    const d = await exec(ctx, "MICROSOFT_TEAMS_CHATS_GET_ALL_MESSAGES", { chat_id: c.id, top: perChat }).catch(() => ({}) as Record<string, unknown>);
    for (const m of firstList(d)) {
      const text = String((m.body as { content?: string } | undefined)?.content ?? "").replace(/<[^>]+>/g, " ");
      if (text.trim()) messages.push({ channel: String(c.topic ?? "chat"), text, posted_at: iso(m.createdDateTime) });
    }
  }
  return chatScan(integration, "composio", messages, limit, now);
}

function rank(slug: string) {
  if (/LIST/.test(slug)) return 0;
  if (/FETCH|RECENT|GET_ALL/.test(slug)) return 1;
  return 2;
}

// One line per system for prompts and evidence lists.
export function describeScan(scan: SystemScan, name = scan.integration): string {
  if (scan.unsupported) return `${name}: connected, not read (${scan.unsupported})`;
  const stats = Object.entries(scan.stats)
    .filter(([, v]) => v !== "" && v !== 0)
    .map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`)
    .join("; ");
  const examples = scan.items
    .slice(0, 5)
    .map((i) => `"${i.title}"`)
    .join(", ");
  const total = scan.estimatedTotal && scan.estimatedTotal > scan.sampled ? ` (a sample of about ${scan.estimatedTotal} in that time; scale volumes to the total)` : "";
  return `${name} (${scan.provider === "sandbox" ? "sandbox" : "live"}): ${scan.sampled} ${scan.itemKind}${scan.periodDays ? ` over ${scan.periodDays} days` : ""}${total}. ${stats}${examples ? `. Examples: ${examples}` : ""}`;
}
