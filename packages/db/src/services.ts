import { agentStats, autonomyScore, departmentAutonomy, type ProcessForMetrics } from "@autonomos/agents";
import type { AutonomyLevel } from "@autonomos/schemas";
import type { DbClient } from "./index";

// ---------------------------------------------------------------------------
// Run creation. Only active agents may run in production (PRD section 36).
// ---------------------------------------------------------------------------

export class RunNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunNotAllowedError";
  }
}

export async function createRun(
  db: DbClient,
  input: {
    organizationId: string;
    agentId: string;
    mode: "test" | "production";
    trigger: Record<string, unknown>;
    input: Record<string, unknown>;
    startedBy?: string | null;
  },
): Promise<{ runId: string }> {
  const { data: agent, error } = await db
    .from("agents")
    .select("id, status, process_id, active_version_id, autonomy_level")
    .eq("organization_id", input.organizationId)
    .eq("id", input.agentId)
    .single();
  if (error || !agent) throw new RunNotAllowedError("Agent not found");

  const { data: org } = await db.from("organizations").select("agents_paused").eq("id", input.organizationId).single();
  if (input.mode === "production") {
    if (org?.agents_paused) throw new RunNotAllowedError("All agents are paused for this organisation");
    if (agent.status !== "active") throw new RunNotAllowedError(`Only active agents run in production (this agent is ${agent.status})`);
  }
  if (agent.autonomy_level === 1) throw new RunNotAllowedError("L1 is human only; raise autonomy to L2 or higher to run the agent");

  // Test runs use the newest version so edits can be tested before activation.
  let versionId = agent.active_version_id;
  if (input.mode === "test" || !versionId) {
    const { data: latest } = await db
      .from("agent_versions")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("agent_id", agent.id)
      .order("version", { ascending: false })
      .limit(1)
      .single();
    versionId = latest?.id ?? null;
  }
  if (!versionId) throw new RunNotAllowedError("Agent has no configuration version");

  const { data: run, error: runError } = await db
    .from("agent_runs")
    .insert({
      organization_id: input.organizationId,
      agent_id: agent.id,
      agent_version_id: versionId,
      process_id: agent.process_id,
      mode: input.mode,
      trigger: input.trigger as never,
      input: input.input as never,
      started_by: input.startedBy ?? null,
    })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`create run: ${runError?.message}`);
  return { runId: run.id };
}

// ---------------------------------------------------------------------------
// Organisation metrics (PRD sections 49-53, 66-69, 129).
// ---------------------------------------------------------------------------

export type OrgMetrics = Awaited<ReturnType<typeof computeOrgMetrics>>;

export async function computeOrgMetrics(db: DbClient, organizationId: string, since?: Date) {
  const monthStart = since ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [org, departments, processes, agents, runs, interventions, approvals, usage, opportunities] = await Promise.all([
    db.from("organizations").select("default_hourly_cost, currency").eq("id", organizationId).single(),
    db.from("departments").select("id, name, hourly_labour_cost").eq("organization_id", organizationId).is("archived_at", null),
    db
      .from("processes")
      .select("id, department_id, status, current_autonomy_level, estimated_occurrences_per_month, estimated_minutes_per_occurrence")
      .eq("organization_id", organizationId)
      .neq("status", "archived"),
    db.from("agents").select("id, process_id, status, autonomy_level").eq("organization_id", organizationId),
    db
      .from("agent_runs")
      .select("id, agent_id, process_id, mode, status, outcome, success, model_cost, estimated_minutes_saved, queued_at")
      .eq("organization_id", organizationId)
      .gte("queued_at", monthStart.toISOString()),
    db.from("human_interventions").select("agent_run_id, type, minutes_spent").eq("organization_id", organizationId).gte("created_at", monthStart.toISOString()),
    db.from("approval_requests").select("agent_id, status").eq("organization_id", organizationId),
    db.from("model_usage").select("estimated_cost").eq("organization_id", organizationId).gte("created_at", monthStart.toISOString()),
    db.from("automation_opportunities").select("id, status").eq("organization_id", organizationId).not("status", "in", "(rejected,archived)"),
  ]);

  const hourlyDefault = Number(org.data?.default_hourly_cost ?? 45);
  const deptCost = new Map((departments.data ?? []).map((d) => [d.id, d.hourly_labour_cost === null ? hourlyDefault : Number(d.hourly_labour_cost)]));
  const processDept = new Map((processes.data ?? []).map((p) => [p.id, p.department_id]));

  const activeLevels = new Map<string, number>();
  for (const a of agents.data ?? []) {
    if (a.status !== "active") continue;
    activeLevels.set(a.process_id, Math.max(activeLevels.get(a.process_id) ?? 1, a.autonomy_level));
  }

  const procs: ProcessForMetrics[] = (processes.data ?? []).map((p) => ({
    id: p.id,
    departmentId: p.department_id,
    status: p.status,
    currentAutonomyLevel: p.current_autonomy_level as AutonomyLevel,
    estimatedOccurrencesPerMonth: p.estimated_occurrences_per_month === null ? null : Number(p.estimated_occurrences_per_month),
    estimatedMinutesPerOccurrence: p.estimated_minutes_per_occurrence === null ? null : Number(p.estimated_minutes_per_occurrence),
  }));

  const prodRuns = (runs.data ?? []).filter((r) => r.mode === "production");
  const minutesSaved = prodRuns.reduce((s, r) => s + Number(r.estimated_minutes_saved ?? 0), 0);
  const valueCreated = prodRuns.reduce((s, r) => {
    const dept = processDept.get(r.process_id);
    const rate = (dept ? deptCost.get(dept) : undefined) ?? hourlyDefault;
    return s + (Number(r.estimated_minutes_saved ?? 0) / 60) * rate;
  }, 0);
  const aiCost = (usage.data ?? []).reduce((s, u) => s + Number(u.estimated_cost), 0);
  const tasksExecuted = prodRuns.filter((r) => r.status === "completed" && r.success).length;

  const interventionRuns = new Set((interventions.data ?? []).map((i) => i.agent_run_id).filter(Boolean) as string[]);
  const perAgent = new Map<string, ReturnType<typeof agentStats>>();
  for (const a of agents.data ?? []) {
    const agentRuns = (runs.data ?? []).filter((r) => r.agent_id === a.id);
    perAgent.set(
      a.id,
      agentStats(
        agentRuns.map((r) => ({
          mode: r.mode,
          status: r.status,
          outcome: r.outcome,
          success: r.success,
          modelCost: Number(r.model_cost),
          estimatedMinutesSaved: r.estimated_minutes_saved === null ? null : Number(r.estimated_minutes_saved),
          hadIntervention: interventionRuns.has(r.id),
        })),
        (approvals.data ?? []).filter((x) => x.agent_id === a.id),
        hourlyDefault,
      ),
    );
  }

  return {
    currency: org.data?.currency ?? "EUR",
    hourlyCost: hourlyDefault,
    autonomyScore: autonomyScore(procs, activeLevels),
    departmentAutonomy: departmentAutonomy(procs, activeLevels).map((d) => ({
      ...d,
      name: (departments.data ?? []).find((x) => x.id === d.departmentId)?.name ?? "Unassigned",
    })),
    processesMapped: procs.length,
    processesAutomated: new Set([...activeLevels.keys()]).size,
    opportunities: (opportunities.data ?? []).length,
    activeAgents: (agents.data ?? []).filter((a) => a.status === "active").length,
    tasksExecuted,
    humanInterventions: (interventions.data ?? []).length,
    hoursSaved: minutesSaved / 60,
    minutesSaved,
    valueCreated,
    aiCost,
    roi: aiCost > 0 ? valueCreated / aiCost : null,
    perAgent,
  };
}

// Persist today's autonomy score so the trend chart has history (PRD section 52).
export async function snapshotMetrics(db: DbClient, organizationId: string) {
  const m = await computeOrgMetrics(db, organizationId);
  const period = new Date().toISOString().slice(0, 10);
  const rows = [
    { metric: "autonomy_score", dimension: "", value: m.autonomyScore ?? 0 },
    { metric: "hours_saved_mtd", dimension: "", value: m.hoursSaved },
    { metric: "ai_cost_mtd", dimension: "", value: m.aiCost },
    ...m.departmentAutonomy.map((d) => ({ metric: "department_autonomy", dimension: d.departmentId ?? "none", value: d.score ?? 0 })),
  ];
  const { error } = await db
    .from("metrics")
    .upsert(
      rows.map((r) => ({ organization_id: organizationId, period, computed_at: new Date().toISOString(), ...r })),
      { onConflict: "organization_id,metric,period,dimension" },
    );
  if (error) throw new Error(`snapshot metrics: ${error.message}`);
  return m;
}
