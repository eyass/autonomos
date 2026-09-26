import "server-only";
import { toolsForIntegrations } from "@autonomos/integrations";
import { dateTime, relative } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { adminDb, isAdmin, type Session } from "@/lib/session";
import { canUseComposio, SANDBOX_INTEGRATIONS } from "@/server/integrations";

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
};

export async function loadIntegrations(session: Session): Promise<IntegrationView[]> {
  const supabase = await createClient();
  const [{ data: catalog }, { data: connections }] = await Promise.all([
    supabase.from("integrations").select("*").order("sort_order"),
    supabase
      .from("integration_connections")
      .select("id, integration_key, status, provider, account_label, connected_at, users:connected_by(first_name, last_name, email)")
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
      };
    });
}
