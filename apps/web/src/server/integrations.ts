import "server-only";
import { composioConfigured, directoryGroups, getComposio, getToolkit, integrationKeyFor, sandboxSeed, searchDirectory, startComposioConnection, toolkitFor } from "@autonomos/integrations";
import { sandboxStore } from "@autonomos/db";
import { audit, activity, track } from "@/lib/audit";
import { adminDb, HttpError, isAdmin, type Session } from "@/lib/session";

// Integrations implemented end to end in the sandbox (tools exist for them).
export const SANDBOX_INTEGRATIONS = ["zendesk", "stripe", "slack", "gmail"];

// Every catalogue row can be connected through Composio once the API key is set.
export function canUseComposio() {
  return composioConfigured();
}

// ---------------------------------------------------------------------------
// The Composio directory: search every toolkit, connect any of them.
// ---------------------------------------------------------------------------

export type DirectoryEntry = { slug: string; key: string; name: string; description: string; logo: string | null; category: string; managedAuth: boolean; connected: boolean };

export async function directoryCategories() {
  if (!composioConfigured()) return [];
  return directoryGroups();
}

export async function searchIntegrationDirectory(session: Session, query: string, group: string | null = null): Promise<DirectoryEntry[]> {
  if (!composioConfigured()) return [];
  const { data: conns } = await adminDb().from("integration_connections").select("integration_key").eq("organization_id", session.org.id).eq("status", "connected");
  const connected = new Set((conns ?? []).map((c) => c.integration_key));
  // Popular systems already connected are replaced by the next most common ones.
  const results = await searchDirectory(query.slice(0, 80), group ? 100 : 30, new Set([...connected].map(toolkitFor)), group);
  const custom = new Set(Object.keys(safeAuthConfigs()));
  return results.map((t) => {
    const key = integrationKeyFor(t.slug);
    return {
      slug: t.slug,
      key,
      name: t.name,
      description: t.description.slice(0, 160),
      logo: t.logo,
      category: t.category,
      managedAuth: t.managedAuth || custom.has(key),
      connected: connected.has(key),
    };
  });
}

function safeAuthConfigs(): Record<string, string> {
  try {
    return JSON.parse(process.env.COMPOSIO_AUTH_CONFIGS ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

// Adds a directory toolkit to the catalogue (once), then starts its sign-in.
export async function connectFromDirectory(session: Session, slug: string, appUrl: string) {
  if (!isAdmin(session)) throw new HttpError(403, "Only admins can connect integrations");
  if (!composioConfigured()) throw new HttpError(400, "Connecting live systems is not available in this workspace yet.");
  const toolkit = await getToolkit(slug);
  if (!toolkit) throw new HttpError(404, "That system is not available to connect.");
  const key = integrationKeyFor(toolkit.slug);
  if (!toolkit.managedAuth && !safeAuthConfigs()[key]) {
    throw new HttpError(409, `${toolkit.name} needs a one-time sign-in setup before it can be connected. Contact support and we will enable it for your workspace.`);
  }
  const db = adminDb();
  await db.from("integrations").upsert(
    {
      key,
      name: toolkit.name,
      category: toolkit.category,
      description: toolkit.description.slice(0, 300) || `${toolkit.name}.`,
      permissions: [`Read ${toolkit.name} data for process discovery`, `Act in ${toolkit.name} only through actions you allow an agent`],
      priority: 99,
      sort_order: 1000,
      logo: toolkit.logo,
      composio_toolkit: toolkit.slug,
      source: "directory",
    },
    { onConflict: "key", ignoreDuplicates: true },
  );
  return startOAuthConnection(session, key, appUrl);
}

async function permissionsFor(key: string) {
  const { data } = await adminDb().from("integrations").select("name, permissions").eq("key", key).maybeSingle();
  if (!data) throw new HttpError(404, "Unknown integration");
  return data;
}

// Connecting is an admin action and shows permissions before connection (PRD sections 55, 71).
export async function connectSandbox(session: Session, key: string) {
  if (!isAdmin(session)) throw new HttpError(403, "Only admins can connect integrations");
  if (!SANDBOX_INTEGRATIONS.includes(key)) throw new HttpError(400, "Sample data is not available for this system.");
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
  if (!canUseComposio()) throw new HttpError(400, "Connecting a live account is not available for this system yet.");
  await permissionsFor(key);
  const callback = `${appUrl}/api/integrations/callback?integration=${encodeURIComponent(key)}`;
  const { redirectUrl } = await startComposioConnection(session.org.id, key, callback);
  if (!redirectUrl) throw new HttpError(502, "The sign-in page could not be opened. Try again in a minute.");
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
        account_label: integration.name,
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
