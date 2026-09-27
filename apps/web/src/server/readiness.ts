import "server-only";
import { isMockMode } from "@autonomos/ai";
import { getTool } from "@autonomos/integrations";
import { executeRun, markRunFailed, RetryableRunError, testGate, toolGate } from "@autonomos/agents";
import { SupabaseRunStore } from "@autonomos/db";
import { enqueueRun, triggerConfigured } from "@autonomos/workflows";
import { after } from "next/server";
import { adminDb, type Session } from "@/lib/session";

export type ReadinessCheck = {
  key: "runtime" | "model" | "approvers" | "integrations" | "tools" | "test";
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
      detail: triggerConfigured() ? "Ready. Runs keep going through restarts and can wait for approvals." : "Not connected, so agents cannot run yet. An administrator connects it once.",
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

// Readiness for one agent: can it be tested, and can it go live? Every rule is decided here
// on the server (activation re-checks it), never only by what the page shows.
type AgentForReadiness = { id: string; versionId: string | null };
type ConfigForReadiness = { tools: string[]; trigger: { type: string; event?: string } };

export async function agentReadiness(session: Session, agent: AgentForReadiness, config: ConfigForReadiness, purpose: "test" | "activate"): Promise<Readiness> {
  const base = await executionReadiness(session);
  const db = adminDb();
  const { data: conns } = await db.from("integration_connections").select("integration_key").eq("organization_id", session.org.id).eq("status", "connected");
  const connected = new Set([...(conns ?? []).map((c) => c.integration_key), "knowledge"]);
  const tools = config.tools.map((t) => getTool(t)).filter((d): d is NonNullable<typeof d> => Boolean(d));
  const missing = [...new Set(tools.map((t) => t.integration).filter((i) => !connected.has(i)))];
  const checks = base.checks.filter((c) => c.key !== "integrations" && (purpose === "activate" || c.key !== "approvers"));
  checks.push({
    key: "integrations",
    label: "Its systems are connected",
    ok: missing.length === 0,
    detail: missing.length ? `Connect ${missing.join(" and ")} first.` : "Every system its tools use is connected.",
    href: "/integrations",
    blocking: true,
  });
  // Connected is not the same as equipped: the agent itself must be able to read the work.
  const coverage = toolGate(
    tools.map((t) => ({ key: t.key, access: t.access, integration: t.integration })),
    config.trigger,
  );
  checks.push({ key: "tools", label: "It can read the work", ok: coverage.ok, detail: coverage.detail, href: `/agents/${agent.id}/edit`, blocking: true });
  if (purpose === "activate") {
    const { data: runs } = await db
      .from("agent_runs")
      .select("status, outcome, success, input, agent_version_id, summary")
      .eq("organization_id", session.org.id)
      .eq("agent_id", agent.id)
      .eq("mode", "test")
      .order("queued_at", { ascending: false })
      .limit(20);
    const gate = testGate(
      (runs ?? []).map((r) => ({ status: r.status, outcome: r.outcome, success: r.success, input: r.input, versionId: r.agent_version_id, summary: r.summary })),
      agent.versionId,
    );
    checks.push({ key: "test", label: "A passed test on real input", ok: gate.ok, detail: gate.detail, blocking: true });
  }
  return summarise(checks);
}

// One state for an agent, derived in one place, so the page cannot say "Ready to go live"
// while also refusing to test. Tests run on this server with simulated writes, so they only
// need the AI model; going live needs every blocking check, including a finished test.
export type AgentPhase = "live" | "paused" | "blocked" | "needs_test" | "ready";
export type AgentState = { phase: AgentPhase; title: string; description: string; canActivate: boolean; testBlockedReason: string | null; readiness: Readiness };

export async function agentState(session: Session, agent: AgentForReadiness & { status: string }, config: ConfigForReadiness): Promise<AgentState> {
  const readiness = await agentReadiness(session, agent, config, "activate");
  const failing = readiness.checks.filter((c) => c.blocking && !c.ok);
  const model = readiness.checks.find((c) => c.key === "model");
  const testBlockedReason = model && !model.ok ? model.detail : null;
  const others = failing.filter((c) => c.key !== "test");
  const phase: AgentPhase = agent.status === "active" ? "live" : others.length ? "blocked" : failing.some((c) => c.key === "test") ? "needs_test" : agent.status === "paused" ? "paused" : "ready";
  const words: Record<AgentPhase, [string, string]> = {
    live: others.length ? ["Needs attention", "Live, but something it depends on is missing."] : ["Live", "Everything this agent needs is in place."],
    paused: ["Paused", "Ready to go live again whenever you activate it."],
    blocked: ["Before going live", `${others.length} thing${others.length === 1 ? "" : "s"} to fix first.`],
    needs_test: ["Test it next", "Activate unlocks once the latest test on this version passes on a sample record."],
    ready: ["Ready to go live", "Its systems are connected, it can read the work, and its latest test passed on a sample record."],
  };
  const [title, description] = words[phase];
  return { phase, title, description, canActivate: agent.status !== "active" && failing.length === 0, testBlockedReason, readiness };
}

// Enqueues a run; if it cannot start, the run is marked failed (with the reason) and shows
// up in Activity instead of sitting in "queued" forever.
// Test runs are short and only simulate writes, so they run right here on the server; they do
// not depend on the background runner being set up. Production runs, which can wait hours for
// an approval, go to the background runner.
export async function enqueueOrFail(organizationId: string, runId: string, idempotencyKey?: string): Promise<{ started: boolean; error?: string }> {
  const { data: meta } = await adminDb().from("agent_runs").select("mode").eq("organization_id", organizationId).eq("id", runId).maybeSingle();
  if (meta?.mode === "test") {
    after(() => runInline(runId));
    return { started: true };
  }
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

async function runInline(runId: string) {
  const store = new SupabaseRunStore(adminDb());
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await executeRun(runId, store);
      return;
    } catch (e) {
      if (e instanceof RetryableRunError && attempt < 3) continue;
      console.error("test run failed", runId, e);
      await markRunFailed(runId, store, e instanceof Error ? e.message : String(e)).catch((err) => console.error("could not mark run failed", runId, err));
      return;
    }
  }
}
