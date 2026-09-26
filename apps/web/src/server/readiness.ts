import "server-only";
import { isMockMode } from "@autonomos/ai";
import { getTool } from "@autonomos/integrations";
import { enqueueRun, triggerConfigured } from "@autonomos/workflows";
import { adminDb, type Session } from "@/lib/session";

export type ReadinessCheck = {
  key: "runtime" | "model" | "approvers" | "integrations" | "test";
  label: string;
  ok: boolean;
  // What is wrong and what to do about it, in customer language.
  detail: string;
  href?: string;
  // Blocking checks stop the action; the rest are warnings.
  blocking: boolean;
};

export type Readiness = { ready: boolean; checks: ReadinessCheck[] };

function summarise(checks: ReadinessCheck[]): Readiness {
  return { ready: checks.every((c) => c.ok || !c.blocking), checks };
}

// Workspace-level execution readiness (Settings, Overview).
export async function executionReadiness(session: Session): Promise<Readiness> {
  const db = adminDb();
  const [{ count: approvers }, { count: connections }] = await Promise.all([
    db.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", session.org.id).eq("can_approve", true),
    db.from("integration_connections").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id).eq("status", "connected"),
  ]);
  return summarise([
    {
      key: "runtime",
      label: "Agent runtime",
      ok: triggerConfigured(),
      detail: triggerConfigured() ? "Connected. Runs are durable and survive restarts." : "Not connected, so agents cannot run yet. An administrator connects it once.",
      href: "/docs/running-agents",
      blocking: true,
    },
    {
      key: "model",
      label: "AI model",
      ok: !isMockMode("AGENT_MODEL"),
      detail: isMockMode("AGENT_MODEL") ? "Demo mode: agents follow a scripted example instead of reasoning." : "Ready.",
      href: "/docs/running-agents",
      blocking: false,
    },
    {
      key: "integrations",
      label: "Connected systems",
      ok: (connections ?? 0) > 0,
      detail: connections ? `${connections} connected.` : "Connect at least one system so agents have something to work with.",
      href: "/integrations",
      blocking: true,
    },
    {
      key: "approvers",
      label: "Approvers",
      ok: (approvers ?? 0) > 0,
      detail: approvers ? `${approvers} ${approvers === 1 ? "person" : "people"} can approve agent actions.` : "Nobody can approve actions. Give at least one member approval permission.",
      href: "/settings#members",
      blocking: true,
    },
  ]);
}

// Readiness for one agent: can it be tested, and can it go live?
export async function agentReadiness(session: Session, agentId: string, tools: string[], purpose: "test" | "activate"): Promise<Readiness> {
  const base = await executionReadiness(session);
  const db = adminDb();
  const { data: conns } = await db.from("integration_connections").select("integration_key").eq("organization_id", session.org.id).eq("status", "connected");
  const connected = new Set([...(conns ?? []).map((c) => c.integration_key), "knowledge"]);
  const missing = [...new Set(tools.map((t) => getTool(t)?.integration).filter((i): i is string => Boolean(i) && !connected.has(i!)))];
  const checks = base.checks.filter((c) => c.key !== "integrations" && (purpose === "activate" || c.key !== "approvers"));
  checks.push({
    key: "integrations",
    label: "Systems this agent uses",
    ok: missing.length === 0,
    detail: missing.length ? `Connect ${missing.join(" and ")} first.` : "All connected.",
    href: "/integrations",
    blocking: true,
  });
  if (purpose === "activate") {
    const { count } = await db
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", session.org.id)
      .eq("agent_id", agentId)
      .eq("mode", "test")
      .eq("status", "completed");
    checks.push({
      key: "test",
      label: "Successful test",
      ok: (count ?? 0) > 0,
      detail: count ? "At least one test finished." : "Run a test first and check what the agent would do.",
      blocking: true,
    });
  }
  return summarise(checks);
}

// Enqueues a run; if it cannot start, the run is marked failed (with the reason) and shows
// up in Activity instead of sitting in "queued" forever.
export async function enqueueOrFail(organizationId: string, runId: string, idempotencyKey?: string): Promise<{ started: boolean; error?: string }> {
  try {
    await enqueueRun(runId, idempotencyKey);
    return { started: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const db = adminDb();
    const { data: run } = await db
      .from("agent_runs")
      .update({ status: "failed", outcome: "failed", error: `Could not start: ${message}`, error_retryable: false, finished_at: new Date().toISOString(), summary: "Could not start" })
      .eq("organization_id", organizationId)
      .eq("id", runId)
      .select("agent_id, process_id, mode, agents(name)")
      .single();
    await db.from("activity_events").insert({
      organization_id: organizationId,
      actor_type: "system",
      action_type: "run_failed_to_start",
      title: `${(run?.agents as unknown as { name: string } | null)?.name ?? "Agent"} ${run?.mode === "test" ? "test" : "run"} could not start: ${message}`,
      status: "error",
      agent_id: run?.agent_id ?? null,
      agent_run_id: runId,
      process_id: run?.process_id ?? null,
      detail: {} as never,
    });
    return { started: false, error: message };
  }
}
