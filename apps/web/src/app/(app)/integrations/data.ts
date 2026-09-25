import "server-only";
import { toolsForIntegrations } from "@autonomos/integrations";
import { createClient } from "@/lib/supabase/server";
import { adminDb, isAdmin, type Session } from "@/lib/session";
import { canUseComposio, SANDBOX_INTEGRATIONS } from "@/server/integrations";

export type IntegrationView = {
  key: string;
  name: string;
  category: string;
  description: string;
  permissions: string[];
  agentActions: string[];
  status: "connected" | "error" | "disconnected" | "not_connected";
  provider: string | null;
  accountLabel: string | null;
  connectedBy: string | null;
  connectedAt: string | null;
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
  return (catalog ?? []).map((i) => {
    const c = connections?.find((x) => x.integration_key === i.key);
    const by = c?.users as unknown as { first_name: string; last_name: string; email: string } | null;
    return {
      key: i.key,
      name: i.name,
      category: i.category,
      description: i.description,
      permissions: (i.permissions as string[]) ?? [],
      agentActions: toolsForIntegrations([i.key]).filter((t) => t.integration === i.key).map((t) => t.label),
      status: (c?.status ?? "not_connected") as IntegrationView["status"],
      provider: c?.provider ?? null,
      accountLabel: c?.account_label ?? null,
      connectedBy: by ? `${by.first_name} ${by.last_name}`.trim() || by.email : null,
      connectedAt: c?.connected_at ?? null,
      sandboxAvailable: SANDBOX_INTEGRATIONS.includes(i.key),
      oauthAvailable: canUseComposio(i.key),
      webhook: c && c.status === "connected" && secrets.get(c.id) ? { url: `${appUrl}/api/webhooks/${c.id}`, secret: secrets.get(c.id)! } : null,
    };
  });
}
