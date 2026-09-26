import "server-only";
import { randomBytes } from "node:crypto";
import { planFor } from "@autonomos/schemas";
import { cookies } from "next/headers";
import { z } from "zod";
import { generateApiKey } from "@/lib/api-auth";
import { activity, audit } from "@/lib/audit";
import { adminDb, HttpError, ORG_COOKIE, requireRole, type Session } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// ---- API keys ----

export async function createApiKey(session: Session, name: string) {
  requireRole(session, ["owner", "admin"]);
  const label = z.string().trim().min(1, "Name the key, for example after the system that uses it").max(60).parse(name);
  const { key, prefix, hash } = generateApiKey();
  const { error } = await adminDb().from("api_keys").insert({ organization_id: session.org.id, name: label, prefix, key_hash: hash, created_by: session.user.id });
  if (error) throw new Error(error.message);
  await audit(session, { action: "api_key.created", input: { name: label, prefix } });
  await activity(session, { actionType: "api_key_created", title: `API key "${label}" created` });
  return { key, prefix };
}

export async function revokeApiKey(session: Session, id: string) {
  requireRole(session, ["owner", "admin"]);
  const { data } = await adminDb()
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("organization_id", session.org.id)
    .eq("id", id)
    .is("revoked_at", null)
    .select("name, prefix")
    .maybeSingle();
  if (!data) throw new HttpError(404, "Key not found or already revoked");
  await audit(session, { action: "api_key.revoked", input: data });
  await activity(session, { actionType: "api_key_revoked", title: `API key "${data.name}" revoked`, status: "warning" });
}

export async function listApiKeys(session: Session) {
  const { data } = await adminDb().from("api_keys").select("id, name, prefix, created_at, last_used_at, revoked_at").eq("organization_id", session.org.id).order("created_at", { ascending: false });
  return data ?? [];
}

// ---- Webhook signing secrets ----

export async function rotateWebhookSecret(session: Session, integrationKey: string) {
  requireRole(session, ["owner", "admin"]);
  const db = adminDb();
  const { data: conn } = await db.from("integration_connections").select("id").eq("organization_id", session.org.id).eq("integration_key", integrationKey).maybeSingle();
  if (!conn) throw new HttpError(404, "Not connected");
  await db
    .from("integration_secrets")
    .update({ webhook_secret: randomBytes(24).toString("hex") })
    .eq("organization_id", session.org.id)
    .eq("connection_id", conn.id);
  await audit(session, { action: "integration.webhook_secret_rotated", input: { integrationKey } });
  await activity(session, { actionType: "webhook_secret_rotated", title: `Webhook signing secret for ${integrationKey} rotated. Update the sender.`, status: "warning" });
}

// ---- Approval limits ----

export async function setApprovalLimit(session: Session, userId: string, limit: number | null) {
  requireRole(session, ["owner", "admin"]);
  const value = limit === null ? null : z.number().min(0).max(10_000_000).parse(limit);
  const { data } = await adminDb().from("organization_members").update({ approval_limit: value }).eq("organization_id", session.org.id).eq("user_id", userId).select("user_id").maybeSingle();
  if (!data) throw new HttpError(404, "Member not found");
  await audit(session, { action: "member.approval_limit", input: { userId, limit: value } });
}

// ---- Plan limits ----

export async function planUsage(session: Session) {
  const db = adminDb();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [{ count: runs }, { count: activeAgents }] = await Promise.all([
    db.from("agent_runs").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id).eq("mode", "production").gte("queued_at", monthStart),
    db.from("agents").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id).eq("status", "active"),
  ]);
  const plan = planFor(session.org.plan);
  const overageRuns = Math.max(0, (runs ?? 0) - plan.runsPerMonth);
  return { plan, runs: runs ?? 0, activeAgents: activeAgents ?? 0, overageRuns, overageCost: overageRuns * plan.overagePerRun };
}

export async function assertAgentAllowance(session: Session) {
  const usage = await planUsage(session);
  if (usage.activeAgents >= usage.plan.activeAgents) {
    throw new HttpError(409, `Your ${usage.plan.name} plan allows ${usage.plan.activeAgents} live agents. Pause one first or change plan in Settings → Billing.`);
  }
}

// ---- Workspaces ----

export async function listWorkspaces(session: Session) {
  const supabase = await createClient();
  const { data } = await supabase.from("organization_members").select("role, organizations(id, name, is_demo)").eq("user_id", session.user.id).order("created_at");
  return (data ?? []).map((m) => ({ ...(m.organizations as unknown as { id: string; name: string; is_demo: boolean }), role: m.role })).filter((w) => Boolean(w.id));
}

export async function switchWorkspace(session: Session, organizationId: string) {
  const workspaces = await listWorkspaces(session);
  if (!workspaces.some((w) => w.id === organizationId)) throw new HttpError(403, "You are not a member of that workspace");
  (await cookies()).set(ORG_COOKIE, organizationId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
}
