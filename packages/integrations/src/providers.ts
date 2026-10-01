import { Composio } from "@composio/core";
import { ToolError, classifyHttpStatus } from "./errors";
import { classifyFailure, isTransient, safeToRetryWrite, withRetry } from "./heal";
import { authPlan, toolkitFor } from "./directory";
import { getTool, type ToolDefinition } from "./tools";
import { checkWarehouseSql, WAREHOUSE_ROW_LIMIT } from "./warehouse";

export type SandboxRecord = Record<string, unknown> & { id: string };

// Organisation-scoped storage for the sandbox provider.
export interface SandboxStore {
  get(system: string, kind: string, id: string): Promise<SandboxRecord | null>;
  list(system: string, kind: string): Promise<SandboxRecord[]>;
  put(system: string, kind: string, record: SandboxRecord): Promise<void>;
}

export interface KnowledgeSearch {
  search(query: string): Promise<Array<{ title: string; excerpt: string }>>;
}

export type ConnectionInfo = {
  integration: string;
  provider: "sandbox" | "composio";
  externalAccountId: string | null;
};

export type ToolExecutionContext = {
  organizationId: string;
  idempotencyKey: string;
  connection: ConnectionInfo | null;
  sandbox: SandboxStore;
  knowledge: KnowledgeSearch;
  now?: () => Date;
};

export async function executeTool(key: string, rawArgs: unknown, ctx: ToolExecutionContext): Promise<unknown> {
  const def = getTool(key);
  if (!def) throw new ToolError("policy_violation", `Unknown tool ${key}`);
  const parsed = def.input.safeParse(rawArgs);
  if (!parsed.success) throw new ToolError("invalid_data", `Invalid arguments for ${key}: ${parsed.error.message}`);
  const args = parsed.data as Record<string, unknown>;

  if (def.integration === "knowledge") {
    return { results: await ctx.knowledge.search(String(args.query)) };
  }
  if (!ctx.connection) throw new ToolError("not_connected", `${def.integration} is not connected`);
  if (def.key === "warehouse.query") return runWarehouseQuery(args, ctx);
  if (ctx.connection.provider === "sandbox") {
    // Sample data exists only for the built-in systems; every other toolkit runs on a live account.
    if (def.source === "composio") throw new ToolError("not_connected", `${def.integration} needs a live connection; sample data covers only the built-in systems`);
    return runSandbox(def, args, ctx);
  }
  return runComposio(def, args, ctx);
}

// ---------------------------------------------------------------------------
// Sandbox provider: a faithful in-database stand-in for Zendesk, Stripe, Slack
// and Gmail so the full refund workflow runs without third-party accounts.
// ---------------------------------------------------------------------------

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
}

async function runSandbox(def: ToolDefinition, args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<unknown> {
  const s = ctx.sandbox;
  const now = (ctx.now ?? (() => new Date()))().toISOString();
  switch (def.key) {
    case "zendesk.read_ticket": {
      const ticket = await s.get("zendesk", "ticket", String(args.ticket_id));
      if (!ticket) throw new ToolError("not_found", `Ticket ${args.ticket_id} not found`);
      return ticket;
    }
    case "zendesk.send_reply": {
      const ticket = await s.get("zendesk", "ticket", String(args.ticket_id));
      if (!ticket) throw new ToolError("not_found", `Ticket ${args.ticket_id} not found`);
      const comments = Array.isArray(ticket.comments) ? ticket.comments : [];
      const comment = { id: id("cmt"), author: "AutonomOS agent", body: args.body, public: args.public, created_at: now, idempotency_key: ctx.idempotencyKey };
      if (comments.some((c: { idempotency_key?: string }) => c.idempotency_key === ctx.idempotencyKey)) return { duplicate: true };
      await s.put("zendesk", "ticket", { ...ticket, comments: [...comments, comment], updated_at: now });
      return { comment_id: comment.id };
    }
    case "zendesk.update_ticket": {
      const ticket = await s.get("zendesk", "ticket", String(args.ticket_id));
      if (!ticket) throw new ToolError("not_found", `Ticket ${args.ticket_id} not found`);
      const tags = Array.from(new Set([...((ticket.tags as string[]) ?? []), ...((args.add_tags as string[]) ?? [])]));
      const updated = { ...ticket, status: args.status ?? ticket.status, tags, updated_at: now };
      await s.put("zendesk", "ticket", updated);
      return { status: updated.status, tags };
    }
    case "stripe.find_customer": {
      const customers = await s.list("stripe", "customer");
      const match = customers.find((c) => String(c.email).toLowerCase() === String(args.email).toLowerCase());
      return match ? { found: true, customer: match } : { found: false };
    }
    case "stripe.list_payments": {
      const payments = (await s.list("stripe", "payment"))
        .filter((p) => p.customer_id === args.customer_id)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, Number(args.limit ?? 10));
      return { payments };
    }
    case "stripe.get_payment": {
      const payment = await s.get("stripe", "payment", String(args.payment_id));
      if (!payment) throw new ToolError("not_found", `Payment ${args.payment_id} not found`);
      return payment;
    }
    case "stripe.list_refunds": {
      const refunds = (await s.list("stripe", "refund")).filter((r) => r.customer_id === args.customer_id);
      return { refunds };
    }
    case "stripe.create_refund": {
      // Mirrors Stripe idempotency: same key returns the original refund.
      const existing = (await s.list("stripe", "refund")).find((r) => r.idempotency_key === ctx.idempotencyKey);
      if (existing) return existing;
      const payment = await s.get("stripe", "payment", String(args.payment_id));
      if (!payment) throw new ToolError("not_found", `Payment ${args.payment_id} not found`);
      const already = Number(payment.refunded_amount ?? 0);
      const amount = Number(args.amount);
      if (amount + already > Number(payment.amount) + 1e-9) {
        throw new ToolError("invalid_data", `Refund of ${amount} exceeds the refundable amount ${Number(payment.amount) - already}`);
      }
      if (String(args.currency).toLowerCase() !== String(payment.currency).toLowerCase()) {
        throw new ToolError("invalid_data", "Refund currency does not match the payment currency");
      }
      const refund: SandboxRecord = {
        id: id("re"),
        payment_id: payment.id,
        customer_id: payment.customer_id,
        amount,
        currency: payment.currency,
        reason: args.reason,
        status: "succeeded",
        created_at: now,
        idempotency_key: ctx.idempotencyKey,
      };
      await s.put("stripe", "refund", refund);
      await s.put("stripe", "payment", { ...payment, refunded_amount: already + amount });
      return refund;
    }
    case "slack.post_message": {
      const msg = { id: id("msg"), channel: args.channel, text: args.text, created_at: now, idempotency_key: ctx.idempotencyKey };
      await s.put("slack", "message", msg);
      return { ts: msg.id };
    }
    case "gmail.send_email": {
      const msg = { id: id("mail"), to: args.to, subject: args.subject, body: args.body, created_at: now, idempotency_key: ctx.idempotencyKey };
      await s.put("gmail", "message", msg);
      return { message_id: msg.id };
    }
    default:
      throw new ToolError("not_connected", `Sandbox does not implement ${def.key}`);
  }
}

// ---------------------------------------------------------------------------
// Composio provider.
//
// Slugs and argument names verified against the Composio catalog on 2026-09-25
// (toolkit versions pinned below). Stripe amounts are converted between minor
// units (Stripe) and major units (AutonomOS policies and prompts).
// ---------------------------------------------------------------------------

type ComposioMapping = {
  slug: string;
  toArgs: (args: Record<string, unknown>) => Record<string, unknown>;
  fromResult?: (data: unknown, args: Record<string, unknown>) => unknown;
};

const toMinor = (amount: unknown) => Math.round(Number(amount) * 100);
const toMajor = (amount: unknown) => Number(amount ?? 0) / 100;

type StripeCharge = {
  id: string;
  customer?: string | null;
  amount?: number;
  amount_refunded?: number;
  currency?: string;
  created?: number;
  description?: string | null;
  status?: string;
  refunds?: { data?: Array<{ id: string; amount: number; currency: string; created: number; reason?: string | null; status?: string }> };
};

// Composio returns the upstream payload, sometimes wrapped in another object.
function unwrap(data: unknown): Record<string, unknown> {
  let d = data as Record<string, unknown>;
  for (const key of ["response_data", "data"]) {
    if (d && typeof d === "object" && d[key] && typeof d[key] === "object" && !Array.isArray(d[key]) && !("object" in d)) {
      d = d[key] as Record<string, unknown>;
    }
  }
  return d ?? {};
}

function list<T>(data: unknown): T[] {
  const d = unwrap(data);
  if (Array.isArray(d)) return d as T[];
  if (Array.isArray(d.data)) return d.data as T[];
  return [];
}

function normaliseCharge(c: StripeCharge) {
  return {
    id: c.id,
    customer_id: c.customer ?? null,
    amount: toMajor(c.amount),
    refunded_amount: toMajor(c.amount_refunded),
    currency: c.currency,
    created_at: c.created ? new Date(c.created * 1000).toISOString() : null,
    description: c.description ?? null,
    status: c.status,
  };
}

export const COMPOSIO_TOOLKIT_VERSIONS: Record<string, string> = {
  zendesk: "20260916_00",
  stripe: "20260915_00",
  slack: "20260915_00",
  gmail: "20260915_00",
};

export const COMPOSIO_MAPPINGS: Record<string, ComposioMapping> = {
  "zendesk.read_ticket": {
    slug: "ZENDESK_GET_ZENDESK_TICKET_BY_ID",
    toArgs: (a) => ({ ticket_id: Number(a.ticket_id) }),
    fromResult: (data) => {
      const d = unwrap(data);
      const t = (d.ticket ?? d) as Record<string, unknown>;
      return {
        id: String(t.id ?? ""),
        subject: t.subject,
        description: t.description,
        status: t.status,
        tags: t.tags ?? [],
        requester_id: t.requester_id,
        requester_email: (t.via as { source?: { from?: { address?: string } } } | undefined)?.source?.from?.address ?? null,
        created_at: t.created_at,
      };
    },
  },
  "zendesk.send_reply": {
    slug: "ZENDESK_REPLY_ZENDESK_TICKET",
    toArgs: (a) => ({ ticket_id: Number(a.ticket_id), body: a.body, public: a.public }),
  },
  "zendesk.update_ticket": {
    slug: "ZENDESK_UPDATE_ZENDESK_TICKET",
    toArgs: (a) => ({ ticket_id: Number(a.ticket_id), status: a.status, tags: a.add_tags, safe_update: true }),
  },
  "stripe.find_customer": {
    slug: "STRIPE_SEARCH_CUSTOMERS",
    toArgs: (a) => ({ query: `email:'${String(a.email).replaceAll("'", "")}'`, limit: 1 }),
    fromResult: (data) => {
      const c = list<{ id: string; email: string; name?: string; metadata?: Record<string, string> }>(data)[0];
      return c ? { found: true, customer: { id: c.id, email: c.email, name: c.name, segment: c.metadata?.segment ?? null } } : { found: false };
    },
  },
  "stripe.list_payments": {
    slug: "STRIPE_LIST_CHARGES",
    toArgs: (a) => ({ customer: a.customer_id, limit: a.limit }),
    fromResult: (data) => ({ payments: list<StripeCharge>(data).map(normaliseCharge) }),
  },
  "stripe.get_payment": {
    slug: "STRIPE_RETRIEVE_CHARGE",
    toArgs: (a) => ({ charge_id: a.payment_id }),
    fromResult: (data) => normaliseCharge(unwrap(data) as unknown as StripeCharge),
  },
  // Stripe's refund list cannot filter by customer, so previous refunds are read from the customer's charges.
  "stripe.list_refunds": {
    slug: "STRIPE_LIST_CHARGES",
    toArgs: (a) => ({ customer: a.customer_id, limit: 100 }),
    fromResult: (data) => ({
      refunds: list<StripeCharge>(data).flatMap((c) =>
        (c.refunds?.data ?? []).map((r) => ({
          id: r.id,
          payment_id: c.id,
          customer_id: c.customer,
          amount: toMajor(r.amount),
          currency: r.currency,
          reason: r.reason ?? null,
          status: r.status,
          created_at: new Date(r.created * 1000).toISOString(),
        })),
      ),
    }),
  },
  "stripe.create_refund": {
    slug: "STRIPE_CREATE_REFUND",
    toArgs: (a) => ({ charge: a.payment_id, amount: toMinor(a.amount), reason: a.reason, metadata: { autonomos_idempotency_key: a.__idempotency_key } }),
    fromResult: (data) => {
      const r = unwrap(data) as { id?: string; amount?: number; currency?: string; status?: string };
      return { id: r.id, amount: toMajor(r.amount), currency: r.currency, status: r.status };
    },
  },
  "slack.post_message": { slug: "SLACK_SEND_MESSAGE", toArgs: (a) => ({ channel: a.channel, markdown_text: a.text }) },
  "gmail.send_email": { slug: "GMAIL_SEND_EMAIL", toArgs: (a) => ({ recipient_email: a.to, subject: a.subject, body: a.body }) },
};

let composioClient: Composio | null = null;

export function composioConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY);
}

export function getComposio(): Composio {
  if (!process.env.COMPOSIO_API_KEY) throw new ToolError("not_connected", "COMPOSIO_API_KEY is not configured");
  if (!composioClient) {
    const toolkitVersions = { ...COMPOSIO_TOOLKIT_VERSIONS, ...(safeJson<Record<string, string>>(process.env.COMPOSIO_TOOLKIT_VERSIONS) ?? {}) };
    composioClient = guardToolkitVersions(new Composio({ apiKey: process.env.COMPOSIO_API_KEY, toolkitVersions }));
  }
  return composioClient;
}

type ExecuteBody = { version?: string; dangerouslySkipVersionCheck?: boolean } & Record<string, unknown>;

// Composio refuses to run a tool by hand ("Toolkit version not specified") when no version is
// passed and none is pinned for its toolkit. Every execution through this client gets a version:
// the one passed, else the toolkit's pinned one, else the current one. The skip flag only applies
// when the version would resolve to "latest", so pinned toolkits keep their pinned version.
export function withToolkitVersion<B extends ExecuteBody>(body: B): B {
  return body.version ? body : { ...body, dangerouslySkipVersionCheck: true };
}

function guardToolkitVersions(client: Composio): Composio {
  const execute = client.tools.execute.bind(client.tools);
  client.tools.execute = ((slug: string, body: ExecuteBody, ...rest: unknown[]) =>
    (execute as (...a: unknown[]) => ReturnType<typeof execute>)(slug, withToolkitVersion(body ?? {}), ...rest)) as typeof client.tools.execute;
  return client;
}

// Composio's catalogue reports this placeholder for tools listed before toolkits were versioned.
export const LEGACY_TOOLKIT_VERSION = "00000000_00";

// The version option for running a Composio action by hand, which Composio requires. Toolkits
// pinned in the client run their pinned version. Others run the version the tool was listed
// with (stored in the agent version's tool snapshot), or the current one when none was stored.
export function composioVersionOption(toolkit: string, version?: string | null): { version: string } | { dangerouslySkipVersionCheck: true } | Record<string, never> {
  const pinned = { ...COMPOSIO_TOOLKIT_VERSIONS, ...(safeJson<Record<string, string>>(process.env.COMPOSIO_TOOLKIT_VERSIONS) ?? {}) };
  if (pinned[toolkit]) return {};
  return version && version !== LEGACY_TOOLKIT_VERSION ? { version } : { dangerouslySkipVersionCheck: true };
}

async function runComposio(def: ToolDefinition, args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<unknown> {
  // Composio tools are the action itself; built-in tools map onto one.
  const mapping: ComposioMapping | undefined = def.source === "composio" ? { slug: def.key.slice("composio:".length), toArgs: ({ __idempotency_key: _, ...a }) => a } : COMPOSIO_MAPPINGS[def.key];
  if (!mapping) throw new ToolError("not_connected", `${def.key} cannot be connected to a live account yet`);
  if (!ctx.connection?.externalAccountId) throw new ToolError("not_connected", `${def.integration} has no connected account`);
  try {
    // Temporary failures are retried with backoff: any of them for a read, only a rate limit
    // (refused before it ran) for an action that changes something, so nothing happens twice.
    const r = await withRetry(
      async () => {
        const response = (await getComposio().tools.execute(mapping.slug, {
          userId: ctx.organizationId,
          connectedAccountId: ctx.connection!.externalAccountId!,
          arguments: stripUndefined(mapping.toArgs({ ...args, __idempotency_key: ctx.idempotencyKey })),
          ...composioVersionOption(toolkitFor(def.integration), def.version),
        })) as { successful?: boolean; error?: string | null; data?: unknown };
        if (response.successful === false) throw new ToolError(classifyFailure({ message: response.error }), response.error ?? `${mapping.slug} failed`);
        return response;
      },
      { when: def.access === "read" ? isTransient : safeToRetryWrite },
    );
    return mapping.fromResult ? mapping.fromResult(r.data, args) : r.data;
  } catch (error) {
    if (error instanceof ToolError) throw error;
    const status = (error as { status?: number; statusCode?: number })?.status ?? (error as { statusCode?: number })?.statusCode;
    if (typeof status === "number") throw new ToolError(classifyHttpStatus(status), String((error as Error).message));
    const name = (error as Error)?.name ?? "";
    if (/Timeout/i.test(name)) throw new ToolError("timeout", String((error as Error).message));
    if (/ConnectedAccountNotFound/i.test(name)) throw new ToolError("not_connected", String((error as Error).message));
    if (/ToolNotFound/i.test(name)) throw new ToolError("invalid_data", String((error as Error).message));
    throw new ToolError("network", String((error as Error)?.message ?? error));
  }
}

// A read-only query in the data warehouse. The SQL is checked again here (the policy engine
// checked it against the agent's allowed dataset already) and always runs with a row cap.
async function runWarehouseQuery(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<unknown> {
  const scope = { project: String(args.project_id), dataset: String(args.dataset) };
  const check = checkWarehouseSql(String(args.sql), scope);
  if (!check.ok) throw new ToolError("policy_violation", check.reason);
  if (ctx.connection?.provider !== "composio" || !ctx.connection.externalAccountId) throw new ToolError("not_connected", "The data warehouse needs a live connection");
  try {
    const response = (await getComposio().tools.execute("GOOGLEBIGQUERY_QUERY", {
      userId: ctx.organizationId,
      connectedAccountId: ctx.connection.externalAccountId,
      arguments: stripUndefined({ project_id: scope.project, query: check.sql, location: args.location }),
      dangerouslySkipVersionCheck: true,
    })) as { successful?: boolean; error?: string | null; data?: unknown };
    if (response.successful === false) throw new ToolError("invalid_data", response.error ?? "The query failed");
    const d = unwrap(response.data);
    const names = ((d.schema as { fields?: Array<{ name?: string }> } | undefined)?.fields ?? []).map((f) => String(f.name ?? ""));
    const rows = (Array.isArray(d.rows) ? d.rows : []).map((r) => {
      const cells = (r as { f?: Array<{ v?: unknown }> }).f;
      return Array.isArray(cells) && names.length ? Object.fromEntries(names.map((n, i) => [n, cells[i]?.v ?? null])) : r;
    });
    return { rows, row_count: rows.length, truncated: rows.length >= WAREHOUSE_ROW_LIMIT };
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError("network", String((error as Error)?.message ?? error));
  }
}

// Map our integration keys to Composio toolkit slugs for OAuth connection.
export const COMPOSIO_TOOLKITS: Record<string, string> = {
  gmail: "gmail",
  outlook: "outlook",
  slack: "slack",
  hubspot: "hubspot",
  salesforce: "salesforce",
  zendesk: "zendesk",
  intercom: "intercom",
  stripe: "stripe",
  google_drive: "googledrive",
  notion: "notion",
};

export async function startComposioConnection(organizationId: string, integration: string, callbackUrl: string) {
  // Curated keys map to their toolkit; any other key is a Composio toolkit slug itself.
  const toolkit = COMPOSIO_TOOLKITS[integration] ?? integration;
  const composio = getComposio();
  const authConfigId = await resolveAuthConfigId(toolkit, integration);
  // connectedAccounts.link is the supported flow; the legacy initiate endpoint (which
  // toolkits.authorize still uses) is retired for Composio-managed OAuth.
  // A workspace can connect again (a retry, another account): the new account replaces the
  // old one when the sign-in completes.
  const request = await composio.connectedAccounts.link(organizationId, authConfigId, { callbackUrl, allowMultiple: true });
  return { redirectUrl: (request as { redirectUrl?: string | null }).redirectUrl ?? null, connectionId: (request as { id: string }).id };
}

// The auth config to connect through: an explicit one from COMPOSIO_AUTH_CONFIGS, else the
// account's Composio-managed config for the toolkit, else a config for a scheme the customer
// completes themselves on Composio's hosted page (their own API key, login or dynamic sign-in).
// Each is created on first use.
const authConfigCache = new Map<string, string>();
async function resolveAuthConfigId(toolkit: string, integration: string): Promise<string> {
  const explicit = (safeJson<Record<string, string>>(process.env.COMPOSIO_AUTH_CONFIGS) ?? {})[integration];
  if (explicit) return explicit;
  const cached = authConfigCache.get(toolkit);
  if (cached) return cached;
  const composio = getComposio();
  const plan = await authPlan(toolkit);
  if (!plan) throw new NeedsSetupError(toolkit);
  let id: string;
  if (plan.managed) {
    const existing = await composio.authConfigs.list({ toolkit, isComposioManaged: true });
    id = existing.items[0]?.id ?? (await composio.authConfigs.create(toolkit, { type: "use_composio_managed_auth" })).id;
  } else {
    const existing = await composio.authConfigs.list({ toolkit, isComposioManaged: false });
    id =
      existing.items.find((a) => a.authScheme === plan.scheme && a.status === "ENABLED")?.id ??
      (await composio.authConfigs.create(toolkit, { type: "use_custom_auth", authScheme: plan.scheme, credentials: {}, name: `${toolkit} (customer credentials)` })).id;
  }
  authConfigCache.set(toolkit, id);
  return id;
}

// The toolkit only signs in through an app registered with the vendor, which we have not set up.
export class NeedsSetupError extends Error {
  constructor(readonly toolkit: string) {
    super(`${toolkit} needs an app registered with the vendor before it can be connected`);
    this.name = "NeedsSetupError";
  }
}

function safeJson<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// The live state of a connected account at Composio: ACTIVE, or EXPIRED, INACTIVE, FAILED when
// the sign-in no longer works. null when Composio cannot be asked right now (try later).
export async function connectedAccountStatus(externalAccountId: string): Promise<string | null> {
  try {
    const a = (await withRetry(() => getComposio().connectedAccounts.get(externalAccountId))) as unknown as { status?: string };
    return a.status ?? null;
  } catch (e) {
    const name = (e as Error)?.name ?? "";
    if (/NotFound/i.test(name) || /not found/i.test(String((e as Error)?.message))) return "DELETED";
    console.error("connected account status unavailable", e);
    return null;
  }
}
