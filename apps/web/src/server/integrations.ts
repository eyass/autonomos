import "server-only";
import { COMPOSIO_TOOLKITS, composioConfigured, getComposio, sandboxSeed, startComposioConnection } from "@autonomos/integrations";
import { sandboxStore } from "@autonomos/db";
import { audit, activity, track } from "@/lib/audit";
import { adminDb, HttpError, isAdmin, type Session } from "@/lib/session";

// Integrations implemented end to end in the sandbox (tools exist for them).
export const SANDBOX_INTEGRATIONS = ["zendesk", "stripe", "slack", "gmail"];

export function canUseComposio(key: string) {
  return composioConfigured() && Boolean(COMPOSIO_TOOLKITS[key]);
}

async function permissionsFor(key: string) {
  const { data } = await adminDb().from("integrations").select("name, permissions").eq("key", key).maybeSingle();
  if (!data) throw new HttpError(404, "Unknown integration");
  return data;
}

// Connecting is an admin action and shows permissions before connection (PRD sections 55, 71).
export async function connectSandbox(session: Session, key: string) {
  if (!isAdmin(session)) throw new HttpError(403, "Only admins can connect integrations");
  if (!SANDBOX_INTEGRATIONS.includes(key)) throw new HttpError(400, "Sandbox mode is not available for this integration");
  const integration = await permissionsFor(key);
  const db = adminDb();
  const { data, error } = await db
    .from("integration_connections")
    .upsert(
      {
        organization_id: session.org.id,
        integration_key: key,
        provider: "sandbox",
        status: "connected",
        account_label: `${integration.name} sandbox`,
        external_account_id: null,
        granted_permissions: integration.permissions,
        connected_by: session.user.id,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        last_error: null,
      },
      { onConflict: "organization_id,integration_key" },
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(`connect: ${error?.message}`);
  await db.from("integration_secrets").upsert({ connection_id: data.id, organization_id: session.org.id }, { onConflict: "connection_id", ignoreDuplicates: true });
  if (key === "stripe") {
    const store = sandboxStore(db, session.org.id);
    const existing = await store.list("stripe", "customer");
    if (!existing.length) for (const { system, kind, record } of sandboxSeed()) await store.put(system, kind, record);
  }
  await afterConnect(session, key, "sandbox");
}

export async function startOAuthConnection(session: Session, key: string, appUrl: string) {
  if (!isAdmin(session)) throw new HttpError(403, "Only admins can connect integrations");
  if (!canUseComposio(key)) throw new HttpError(400, "Composio is not configured for this integration");
  await permissionsFor(key);
  const callback = `${appUrl}/api/integrations/callback?integration=${encodeURIComponent(key)}`;
  const { redirectUrl } = await startComposioConnection(session.org.id, key, callback);
  if (!redirectUrl) throw new HttpError(502, "Composio did not return an authorisation URL");
  return redirectUrl;
}

// Composio redirects back with the connected account id. We verify it with Composio
// rather than trusting the query string, and check it belongs to this organisation.
export async function completeOAuthConnection(session: Session, key: string, connectedAccountId: string) {
  if (!isAdmin(session)) throw new HttpError(403, "Only admins can connect integrations");
  const account = (await getComposio().connectedAccounts.get(connectedAccountId)) as unknown as {
    id: string;
    status?: string;
    userId?: string;
    user_id?: string;
    toolkit?: { slug?: string };
  };
  const owner = account.userId ?? account.user_id;
  if (owner && owner !== session.org.id) throw new HttpError(403, "This connection belongs to another organisation");
  if (account.status && account.status.toUpperCase() !== "ACTIVE") throw new HttpError(409, `Connection is ${account.status.toLowerCase()}, try again`);
  const integration = await permissionsFor(key);
  const db = adminDb();
  const { data, error } = await db
    .from("integration_connections")
    .upsert(
      {
        organization_id: session.org.id,
        integration_key: key,
        provider: "composio",
        status: "connected",
        account_label: `${integration.name} (Composio)`,
        external_account_id: account.id,
        granted_permissions: integration.permissions,
        connected_by: session.user.id,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        last_error: null,
      },
      { onConflict: "organization_id,integration_key" },
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(`connect: ${error?.message}`);
  await db.from("integration_secrets").upsert({ connection_id: data.id, organization_id: session.org.id }, { onConflict: "connection_id", ignoreDuplicates: true });
  await afterConnect(session, key, "composio");
}

async function afterConnect(session: Session, key: string, provider: string) {
  await audit(session, { action: "integration.connected", system: key, input: { provider } });
  await activity(session, { actionType: "integration_connected", title: `Connected ${key}${provider === "sandbox" ? " (sandbox)" : ""}`, status: "success" });
  await track(session, "integration_connected", { integration: key, provider });
}

export async function disconnect(session: Session, key: string) {
  if (!isAdmin(session)) throw new HttpError(403, "Only admins can disconnect integrations");
  const db = adminDb();
  const { data } = await db
    .from("integration_connections")
    .update({ status: "disconnected", disconnected_at: new Date().toISOString() })
    .eq("organization_id", session.org.id)
    .eq("integration_key", key)
    .select("provider, external_account_id")
    .maybeSingle();
  if (data?.provider === "composio" && data.external_account_id && composioConfigured()) {
    try {
      await getComposio().connectedAccounts.delete(data.external_account_id);
    } catch (e) {
      console.error("composio disconnect failed", e);
    }
  }
  await audit(session, { action: "integration.disconnected", system: key });
  await activity(session, { actionType: "integration_disconnected", title: `Disconnected ${key}`, status: "warning" });
}
