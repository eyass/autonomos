import "server-only";
import { getTool, isInventory, toolsForIntegrations } from "@autonomos/integrations";
import { dateTime, relative } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { adminDb, isAdmin, type Session } from "@/lib/session";
import { canUseComposio, SANDBOX_INTEGRATIONS } from "@/server/integrations";
import { INVENTORY_STALE_MS } from "@/server/inventory";

export type IntegrationView = {
  key: string;
  name: string;
  category: string;
  description: string;
  logo: string | null;
  // Curated systems have agent actions; directory systems are read for discovery.
  source: "curated" | "directory";
  permissions: string[];
  // What an agent can be allowed to do with this system (each agent gets an explicit subset).
  agentReads: string[];
  agentActs: string[];
  status: "connected" | "error" | "disconnected" | "not_connected";
  provider: string | null;
  accountLabel: string | null;
  connectedBy: string | null;
  // Preformatted on the server so client rendering cannot differ (time zones).
  connectedAtLabel: string | null;
  lastUsedLabel: string | null;
  sandboxAvailable: boolean;
  oauthAvailable: boolean;
  webhook: { url: string; secret: string } | null;
  // What the system holds, mapped once when it was connected.
  inventory: InventoryView | null;
  // Which agents use it, and what each is allowed to read and do there (their latest version).
  agents: Array<{ id: string; name: string; status: string; reads: string[]; acts: string[] }>;
};

export type InventoryView = {
  state: "running" | "ready" | "failed" | "none";
  summary: string | null;
  takenAtLabel: string | null;
  groups: Array<{ kind: string; items: string[]; more: number }>;
  notes: string[];
  error: string | null;
};

function inventoryView(c: { inventory: unknown; inventory_status: string | null; inventoried_at: string | null; inventory_error: string | null }): InventoryView {
  const inv = isInventory(c.inventory) ? c.inventory : null;
  const cutOff = c.inventory_status === "running" && c.inventoried_at && Date.now() - new Date(c.inventoried_at).getTime() > INVENTORY_STALE_MS;
  const state = cutOff ? "failed" : ((c.inventory_status as InventoryView["state"] | null) ?? (inv ? "ready" : "none"));
  const byKind = new Map<string, string[]>();
  for (const r of inv?.resources ?? [])
    byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), `${r.name ?? r.id}${r.count !== undefined && r.kind === "table" ? ` (${r.count.toLocaleString("en")} rows)` : ""}`]);
  if (inv?.readers.length)
    byKind.set(
      "readable record",
      inv.readers.map((r) =>
        r.slug
          .replace(/^[A-Z0-9]+_/, "")
          .replaceAll("_", " ")
          .toLowerCase(),
      ),
    );
  return {
    state,
    summary: inv?.summary ?? null,
    takenAtLabel: inv ? dateTime(inv.takenAt) : null,
    groups: [...byKind].map(([kind, items]) => ({ kind, items: items.slice(0, 30), more: Math.max(0, items.length - 30) })),
    notes: inv?.notes ?? [],
    error: cutOff ? "Mapping was interrupted." : (c.inventory_error ?? null),
  };
}

export async function loadIntegrations(session: Session): Promise<IntegrationView[]> {
  const supabase = await createClient();
  const [{ data: catalog }, { data: connections }] = await Promise.all([
    supabase.from("integrations").select("*").order("sort_order"),
    supabase
      .from("integration_connections")
      .select("id, integration_key, status, provider, account_label, connected_at, inventory, inventory_status, inventoried_at, inventory_error, users:connected_by(first_name, last_name, email)")
      .eq("organization_id", session.org.id),
  ]);
  // Webhook signing secrets are only loaded for admins, server-side.
  const secrets = new Map<string, string>();
  if (isAdmin(session) && connections?.length) {
    const { data } = await adminDb().from("integration_secrets").select("connection_id, webhook_secret").eq("organization_id", session.org.id);
    for (const r of data ?? []) secrets.set(r.connection_id, r.webhook_secret);
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  // Last time an agent used each system, from the action log.
  const lastUsed = new Map<string, string>();
  if (connections?.length) {
    const { data: actions } = await adminDb().from("agent_actions").select("tool, created_at").eq("organization_id", session.org.id).order("created_at", { ascending: false }).limit(300);
    for (const a of actions ?? []) {
      const key = String(a.tool).split(".")[0]!;
      if (!lastUsed.has(key)) lastUsed.set(key, a.created_at);
    }
  }
  // Per-agent capabilities: each agent's latest version and the tools it was given.
  const byIntegration = new Map<string, IntegrationView["agents"]>();
  if (connections?.length) {
    const db = adminDb();
    const [{ data: agents }, { data: versions }] = await Promise.all([
      db.from("agents").select("id, name, status").eq("organization_id", session.org.id).neq("status", "archived"),
      db.from("agent_versions").select("id, agent_id, version, agent_tools(tool_key)").eq("organization_id", session.org.id).order("version", { ascending: false }),
    ]);
    const latest = new Map<string, string[]>();
    for (const v of versions ?? [])
      if (!latest.has(v.agent_id))
        latest.set(
          v.agent_id,
          ((v.agent_tools as unknown as Array<{ tool_key: string }>) ?? []).map((t) => t.tool_key),
        );
    for (const a of agents ?? []) {
      const tools = (latest.get(a.id) ?? []).map((k) => getTool(k)).filter((t): t is NonNullable<ReturnType<typeof getTool>> => Boolean(t));
      for (const key of new Set(tools.map((t) => t.integration))) {
        const mine = tools.filter((t) => t.integration === key);
        const list = byIntegration.get(key) ?? [];
        list.push({ id: a.id, name: a.name, status: a.status, reads: mine.filter((t) => t.access === "read").map((t) => t.label), acts: mine.filter((t) => t.access === "write").map((t) => t.label) });
        byIntegration.set(key, list);
      }
    }
  }
  // Directory systems appear once an organisation has connected them.
  const connectedKeys = new Set((connections ?? []).map((c) => c.integration_key));
  return (catalog ?? [])
    .filter((i) => i.source !== "directory" || connectedKeys.has(i.key))
    .map((i) => {
      const c = connections?.find((x) => x.integration_key === i.key);
      const by = c?.users as unknown as { first_name: string; last_name: string; email: string } | null;
      return {
        key: i.key,
        name: i.name,
        category: i.category,
        description: i.description,
        logo: i.logo ?? null,
        source: (i.source as "curated" | "directory") ?? "curated",
        permissions: (i.permissions as string[]) ?? [],
        agentReads: toolsForIntegrations([i.key])
          .filter((t) => t.integration === i.key && t.access === "read")
          .map((t) => t.label),
        agentActs: toolsForIntegrations([i.key])
          .filter((t) => t.integration === i.key && t.access === "write")
          .map((t) => t.label),
        status: (c?.status ?? "not_connected") as IntegrationView["status"],
        provider: c?.provider ?? null,
        accountLabel: c?.account_label ?? null,
        connectedBy: by ? `${by.first_name} ${by.last_name}`.trim() || by.email : null,
        connectedAtLabel: c?.connected_at ? dateTime(c.connected_at) : null,
        lastUsedLabel: lastUsed.get(i.key) ? relative(lastUsed.get(i.key)!) : null,
        sandboxAvailable: SANDBOX_INTEGRATIONS.includes(i.key),
        oauthAvailable: canUseComposio(),
        webhook: c && c.status === "connected" && secrets.get(c.id) ? { url: `${appUrl}/api/webhooks/${c.id}`, secret: secrets.get(c.id)! } : null,
        inventory: c && c.status === "connected" ? inventoryView(c) : null,
        agents: byIntegration.get(i.key) ?? [],
      };
    });
}
