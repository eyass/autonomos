import { ToolError } from "./errors";
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
  // Set when the system cannot be read yet; discovery continues without it.
  unsupported?: string;
};

export type ScanContext = { organizationId: string; connection: ConnectionInfo; sandbox: SandboxStore; now?: Date };

export const SCANNABLE = ["zendesk", "gmail", "stripe", "slack"];

const MAX_ITEMS = 40;

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
// Shaping: one function per system turns raw records into a SystemScan.
// ---------------------------------------------------------------------------

function ticketsScan(provider: SystemScan["provider"], tickets: Array<Record<string, unknown>>, now: Date): SystemScan {
  const items = tickets.slice(0, MAX_ITEMS).map((t) => ({
    title: redact(t.subject, 140),
    detail: redact(t.description, 200),
    date: (t.created_at as string) ?? null,
    labels: ((t.tags as string[]) ?? []).slice(0, 6),
  }));
  return {
    integration: "zendesk",
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

function emailsScan(provider: SystemScan["provider"], messages: Array<Record<string, unknown>>, now: Date): SystemScan {
  const items = messages.slice(0, MAX_ITEMS).map((m) => ({
    title: redact(m.subject, 140),
    detail: redact(m.snippet, 200),
    date: (m.received_at as string) ?? null,
    from: domainOf(m.from),
    labels: ((m.labels as string[]) ?? []).filter((l) => !/^(UNREAD|IMPORTANT|CATEGORY_PERSONAL)$/.test(l)).slice(0, 4),
  }));
  return {
    integration: "gmail",
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

function paymentsScan(provider: SystemScan["provider"], payments: Array<Record<string, unknown>>, refunds: Array<Record<string, unknown>>, now: Date): SystemScan {
  const items: ScanItem[] = [
    ...refunds
      .slice(0, 20)
      .map((r) => ({
        title: `Refund ${r.reason ? `(${String(r.reason).replaceAll("_", " ")})` : ""}`.trim(),
        amount: Number(r.amount ?? 0),
        date: (r.created_at as string) ?? null,
        labels: ["refund"],
      })),
    ...payments
      .slice(0, 20)
      .map((p) => ({ title: redact(p.description ?? "Payment", 100), amount: Number(p.amount ?? 0), date: (p.created_at as string) ?? null, labels: [String(p.status ?? "succeeded")] })),
  ];
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

function chatScan(provider: SystemScan["provider"], messages: Array<Record<string, unknown>>, now: Date): SystemScan {
  const items = messages.slice(0, MAX_ITEMS).map((m) => ({ title: redact(m.text, 180), labels: [String(m.channel ?? "")], date: (m.posted_at as string) ?? null }));
  return {
    integration: "slack",
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

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

export async function scanSystem(integration: string, ctx: ScanContext): Promise<SystemScan> {
  const now = ctx.now ?? new Date();
  const provider = ctx.connection.provider;
  if (!SCANNABLE.includes(integration)) {
    return { integration, provider, itemKind: "records", sampled: 0, periodDays: null, stats: {}, items: [], unsupported: "Reading this system is not supported yet." };
  }
  if (provider === "sandbox") return scanSandbox(integration, ctx.sandbox, now);
  return scanComposio(integration, ctx, now);
}

async function scanSandbox(integration: string, s: SandboxStore, now: Date): Promise<SystemScan> {
  const newest = (a: SandboxRecord, b: SandboxRecord, field: string) => String(b[field] ?? "").localeCompare(String(a[field] ?? ""));
  if (integration === "zendesk")
    return ticketsScan(
      "sandbox",
      (await s.list("zendesk", "ticket")).sort((a, b) => newest(a, b, "created_at")),
      now,
    );
  if (integration === "gmail")
    return emailsScan(
      "sandbox",
      (await s.list("gmail", "message")).sort((a, b) => newest(a, b, "received_at")),
      now,
    );
  if (integration === "slack")
    return chatScan(
      "sandbox",
      (await s.list("slack", "message")).sort((a, b) => newest(a, b, "posted_at")),
      now,
    );
  const [payments, refunds] = await Promise.all([s.list("stripe", "payment"), s.list("stripe", "refund")]);
  return paymentsScan("sandbox", payments, refunds, now);
}

async function exec(ctx: ScanContext, slug: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!ctx.connection.externalAccountId) throw new ToolError("not_connected", "No connected account");
  const r = (await getComposio().tools.execute(slug, { userId: ctx.organizationId, connectedAccountId: ctx.connection.externalAccountId, arguments: args })) as {
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
  const n = Number(v);
  if (Number.isFinite(n)) return new Date(n > 1e12 ? n : n * 1000).toISOString();
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

async function scanComposio(integration: string, ctx: ScanContext, now: Date): Promise<SystemScan> {
  if (integration === "gmail") {
    const d = await exec(ctx, "GMAIL_FETCH_EMAILS", { query: "newer_than:30d -category:promotions -category:social", max_results: MAX_ITEMS, include_payload: false, verbose: false });
    const messages = arr(d.messages).map((m) => ({
      subject: m.subject,
      snippet: (m.preview as { body?: string } | undefined)?.body ?? m.snippet ?? m.messageText,
      from: m.sender ?? m.from,
      labels: m.labelIds,
      received_at: iso(m.messageTimestamp ?? m.internalDate),
    }));
    return emailsScan("composio", messages, now);
  }
  if (integration === "zendesk") {
    const d = await exec(ctx, "ZENDESK_LIST_ZENDESK_TICKETS", { per_page: MAX_ITEMS, sort_by: "created_at", sort_order: "desc" });
    return ticketsScan("composio", arr(d.tickets ?? d.data), now);
  }
  if (integration === "stripe") {
    const [charges, refunds] = await Promise.all([exec(ctx, "STRIPE_LIST_CHARGES", { limit: 50 }), exec(ctx, "STRIPE_LIST_REFUNDS", { limit: 30 })]);
    const minor = (v: unknown) => Number(v ?? 0) / 100;
    return paymentsScan(
      "composio",
      arr(charges.data).map((c) => ({ amount: minor(c.amount), description: c.description, status: c.status, created_at: iso(c.created) })),
      arr(refunds.data).map((r) => ({ amount: minor(r.amount), reason: r.reason, created_at: iso(r.created) })),
      now,
    );
  }
  // Slack: the busiest few public channels, recent history of each.
  const channels = arr((await exec(ctx, "SLACK_LIST_ALL_CHANNELS", { limit: 50, exclude_archived: true, types: "public_channel" })).channels)
    .sort((a, b) => Number(b.num_members ?? 0) - Number(a.num_members ?? 0))
    .slice(0, 4);
  const oldest = String(Math.floor((now.getTime() - 30 * 86_400_000) / 1000));
  const messages: Array<Record<string, unknown>> = [];
  for (const c of channels) {
    const h = await exec(ctx, "SLACK_FETCH_CONVERSATION_HISTORY", { channel: c.id, limit: 15, oldest }).catch(() => ({}) as Record<string, unknown>);
    for (const m of arr(h.messages)) if (!m.subtype) messages.push({ channel: `#${c.name}`, text: m.text, posted_at: iso(m.ts) });
  }
  return chatScan("composio", messages, now);
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
  return `${name} (${scan.provider === "sandbox" ? "sandbox" : "live"}): ${scan.sampled} ${scan.itemKind}${scan.periodDays ? ` over ${scan.periodDays} days` : ""}. ${stats}${examples ? `. Examples: ${examples}` : ""}`;
}
