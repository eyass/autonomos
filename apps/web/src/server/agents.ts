import "server-only";
import { policyForTools } from "@autonomos/agents";
import { createRun, RunNotAllowedError } from "@autonomos/db";
import { buildSandboxTicket, getTool, SAMPLE_TICKETS } from "@autonomos/integrations";
import { AgentConfigSchema, PolicyConfigSchema, type AgentConfig, type PolicyConfig } from "@autonomos/schemas";
import { deactivateAgentSchedule, enqueueRun, TriggerNotConfiguredError, upsertAgentSchedule } from "@autonomos/workflows";
import { sandboxStore } from "@autonomos/db";
import { activity, audit, track } from "@/lib/audit";
import { adminDb, HttpError, isAdmin, type Session } from "@/lib/session";
import { connectedIntegrationKeys } from "./opportunities";

function mapRunError(error: unknown): never {
  if (error instanceof RunNotAllowedError) throw new HttpError(409, error.message);
  if (error instanceof TriggerNotConfiguredError) throw new HttpError(503, error.message);
  throw error;
}

async function assertToolsAllowed(session: Session, tools: string[]) {
  const connected = new Set([...(await connectedIntegrationKeys(session)), "knowledge"]);
  for (const key of tools) {
    const def = getTool(key);
    if (!def) throw new HttpError(400, `Unknown tool ${key}`);
    if (!connected.has(def.integration)) throw new HttpError(400, `Connect ${def.integration} before giving the agent "${def.label}"`);
  }
}

async function insertVersion(session: Session, agentId: string, version: number, config: AgentConfig, note: string) {
  const db = adminDb();
  const { data, error } = await db
    .from("agent_versions")
    .insert({
      organization_id: session.org.id,
      agent_id: agentId,
      version,
      autonomy_level: config.autonomyLevel,
      instructions: config.instructions as never,
      trigger_config: config.trigger as never,
      policy_config: config.policy as never,
      success_criteria: config.successCriteria as never,
      model_config: config.modelConfig as never,
      change_note: note,
      created_by: session.user.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`version: ${error?.message}`);
  const { error: toolError } = await db
    .from("agent_tools")
    .insert([...new Set(config.tools)].map((tool_key) => ({ organization_id: session.org.id, agent_version_id: data.id, tool_key })));
  if (toolError) throw new Error(`tools: ${toolError.message}`);
  return data.id;
}

export async function createAgent(session: Session, input: { processId: string; opportunityId: string | null; config: AgentConfig }) {
  const config = AgentConfigSchema.parse(input.config);
  await assertToolsAllowed(session, config.tools);
  const db = adminDb();
  const { data: process } = await db.from("processes").select("id, department_id").eq("organization_id", session.org.id).eq("id", input.processId).maybeSingle();
  if (!process) throw new HttpError(404, "Process not found");
  const { data: agent, error } = await db
    .from("agents")
    .insert({
      organization_id: session.org.id,
      process_id: input.processId,
      opportunity_id: input.opportunityId,
      name: config.name,
      description: config.description,
      objective: config.instructions.objective,
      autonomy_level: config.autonomyLevel,
      status: "draft",
      created_by: session.user.id,
    })
    .select("id")
    .single();
  if (error || !agent) throw new Error(`agent: ${error?.message}`);
  const versionId = await insertVersion(session, agent.id, 1, config, "Created");
  await db.from("agents").update({ active_version_id: versionId }).eq("organization_id", session.org.id).eq("id", agent.id);
  if (input.opportunityId) {
    await db.from("automation_opportunities").update({ status: "building" }).eq("organization_id", session.org.id).eq("id", input.opportunityId);
  }
  await audit(session, { action: "agent.created", agentId: agent.id, agentVersionId: versionId, processId: input.processId, input: config });
  await activity(session, { actionType: "agent_created", title: `Created agent ${config.name}`, agentId: agent.id, processId: input.processId, departmentId: process.department_id });
  await track(session, "agent_created", { agent_id: agent.id, autonomy_level: config.autonomyLevel });
  return agent.id;
}

export async function loadAgentConfig(session: Session, agentId: string, versionId?: string | null) {
  const db = adminDb();
  const { data: agent } = await db.from("agents").select("*").eq("organization_id", session.org.id).eq("id", agentId).maybeSingle();
  if (!agent) throw new HttpError(404, "Agent not found");
  let query = db.from("agent_versions").select("*, agent_tools(tool_key)").eq("organization_id", session.org.id).eq("agent_id", agentId);
  query = versionId ? query.eq("id", versionId) : query.order("version", { ascending: false }).limit(1);
  const { data: versions } = await query;
  const v = versions?.[0];
  if (!v) throw new HttpError(404, "Agent has no configuration");
  const config: AgentConfig = AgentConfigSchema.parse({
    name: agent.name,
    description: agent.description,
    autonomyLevel: v.autonomy_level,
    instructions: v.instructions,
    trigger: v.trigger_config,
    tools: ((v.agent_tools as unknown as Array<{ tool_key: string }>) ?? []).map((t) => t.tool_key),
    policy: v.policy_config,
    successCriteria: v.success_criteria,
    modelConfig: v.model_config,
  });
  return { agent, version: v, config };
}

// Every configuration change creates a new immutable version (PRD section 85).
export async function updateAgentConfig(session: Session, agentId: string, next: AgentConfig, note: string) {
  const config = AgentConfigSchema.parse(next);
  await assertToolsAllowed(session, config.tools);
  const { agent, version, config: previous } = await loadAgentConfig(session, agentId);
  const versionId = await insertVersion(session, agentId, version.version + 1, config, note);
  const db = adminDb();
  await db
    .from("agents")
    .update({ name: config.name, description: config.description, objective: config.instructions.objective, autonomy_level: config.autonomyLevel, active_version_id: versionId })
    .eq("organization_id", session.org.id)
    .eq("id", agentId);
  if (agent.status === "active") await syncSchedule(session, agentId, config, agent.trigger_schedule_id);
  await audit(session, { action: "agent.version_created", agentId, agentVersionId: versionId, input: { note, config }, output: { previousVersion: version.version } });
  if (previous.autonomyLevel !== config.autonomyLevel) {
    await track(session, "autonomy_changed", { agent_id: agentId, from: previous.autonomyLevel, to: config.autonomyLevel });
    await activity(session, { actionType: "autonomy_changed", title: `${config.name} moved from L${previous.autonomyLevel} to L${config.autonomyLevel}`, agentId, processId: agent.process_id });
  }
  return versionId;
}

export async function changeAutonomy(session: Session, agentId: string, level: number, policyOverride?: Partial<PolicyConfig>) {
  if (!isAdmin(session)) throw new HttpError(403, "Only admins can change autonomy");
  const { config } = await loadAgentConfig(session, agentId);
  const template = policyForTools(config.tools, level);
  // Keep custom rules, but reset level-dependent thresholds to the template for the new level unless overridden.
  const policy = PolicyConfigSchema.parse({
    ...config.policy,
    approvalRequiredFor: template.approvalRequiredFor,
    amountThresholds: config.policy.amountThresholds.length
      ? config.policy.amountThresholds.map((t) => ({ ...t, maxWithoutApproval: template.amountThresholds.find((x) => x.tool === t.tool)?.maxWithoutApproval ?? t.maxWithoutApproval }))
      : template.amountThresholds,
    ...policyOverride,
  });
  return updateAgentConfig(session, agentId, { ...config, autonomyLevel: level as AgentConfig["autonomyLevel"], policy }, `Autonomy changed to L${level}`);
}

async function syncSchedule(session: Session, agentId: string, config: AgentConfig, existingScheduleId: string | null) {
  const db = adminDb();
  if (config.trigger.type === "schedule") {
    const id = await upsertAgentSchedule(agentId, config.trigger.cron, config.trigger.timezone);
    await db.from("agents").update({ trigger_schedule_id: id }).eq("organization_id", session.org.id).eq("id", agentId);
  } else if (existingScheduleId) {
    await deactivateAgentSchedule(existingScheduleId);
    await db.from("agents").update({ trigger_schedule_id: null }).eq("organization_id", session.org.id).eq("id", agentId);
  }
}

export async function startTestRun(session: Session, agentId: string, input: Record<string, unknown>) {
  const db = adminDb();
  const { agent } = await loadAgentConfig(session, agentId);
  if (agent.status === "draft") await db.from("agents").update({ status: "testing" }).eq("organization_id", session.org.id).eq("id", agentId);
  try {
    const { runId } = await createRun(db, { organizationId: session.org.id, agentId, mode: "test", trigger: { type: "manual", test: true }, input, startedBy: session.user.id });
    await enqueueRun(runId);
    await track(session, "agent_test_started", { agent_id: agentId, run_id: runId });
    return runId;
  } catch (e) {
    mapRunError(e);
  }
}

export async function startProductionRun(session: Session, agentId: string, input: Record<string, unknown>) {
  try {
    const { runId } = await createRun(adminDb(), { organizationId: session.org.id, agentId, mode: "production", trigger: { type: "manual", userId: session.user.id }, input, startedBy: session.user.id });
    await enqueueRun(runId);
    await track(session, "agent_run_started", { agent_id: agentId, run_id: runId });
    return runId;
  } catch (e) {
    mapRunError(e);
  }
}

export async function activateAgent(session: Session, agentId: string) {
  if (!isAdmin(session)) throw new HttpError(403, "Only admins can activate agents");
  const db = adminDb();
  const { agent, version, config } = await loadAgentConfig(session, agentId);
  if (config.autonomyLevel < 2) throw new HttpError(409, "An L1 agent cannot be activated; L1 means humans do the work");
  const { count } = await db
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", session.org.id)
    .eq("agent_id", agentId)
    .eq("mode", "test")
    .eq("status", "completed");
  if (!count) throw new HttpError(409, "Run at least one test before activating the agent");
  await assertToolsAllowed(session, config.tools);
  try {
    await syncSchedule(session, agentId, config, agent.trigger_schedule_id);
  } catch (e) {
    mapRunError(e);
  }
  await db.from("agents").update({ status: "active", active_version_id: version.id }).eq("organization_id", session.org.id).eq("id", agentId);
  if (agent.opportunity_id) await db.from("automation_opportunities").update({ status: "live" }).eq("organization_id", session.org.id).eq("id", agent.opportunity_id);
  await audit(session, { action: "agent.activated", agentId, agentVersionId: version.id, processId: agent.process_id });
  await activity(session, { actionType: "agent_activated", title: `${agent.name} is live at L${config.autonomyLevel}`, agentId, processId: agent.process_id, status: "success" });
  await track(session, "agent_activated", { agent_id: agentId, autonomy_level: config.autonomyLevel });
}

export async function pauseAgent(session: Session, agentId: string) {
  const db = adminDb();
  const { agent } = await loadAgentConfig(session, agentId);
  await db.from("agents").update({ status: "paused" }).eq("organization_id", session.org.id).eq("id", agentId);
  if (agent.trigger_schedule_id) {
    try {
      await deactivateAgentSchedule(agent.trigger_schedule_id);
    } catch (e) {
      // Pausing must always succeed; scheduled runs also refuse to start for paused agents.
      console.error("schedule deactivate failed", e);
    }
  }
  await audit(session, { action: "agent.paused", agentId, processId: agent.process_id });
  await activity(session, { actionType: "agent_paused", title: `${agent.name} paused`, agentId, processId: agent.process_id, status: "warning" });
  await track(session, "agent_paused", { agent_id: agentId });
}

// Fires an integration event into every active agent listening for it (PRD section 31).
export async function dispatchIntegrationEvent(organizationId: string, event: string, payload: Record<string, unknown>) {
  const db = adminDb();
  const { data: agents } = await db
    .from("agents")
    .select("id, active_version_id, agent_versions!agents_active_version_fk(trigger_config)")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  const listening = (agents ?? []).filter((a) => {
    const t = (a.agent_versions as unknown as { trigger_config: { type: string; event?: string } } | null)?.trigger_config;
    return t?.type === "integration_event" && t.event === event;
  });
  const runIds: string[] = [];
  for (const a of listening) {
    const { runId } = await createRun(db, { organizationId, agentId: a.id, mode: "production", trigger: { type: "integration_event", event }, input: payload });
    await enqueueRun(runId);
    runIds.push(runId);
  }
  return runIds;
}

// Demo helper: a sample customer ticket arrives in the sandbox Zendesk.
export async function simulateSandboxTicket(session: Session, sampleKey: string) {
  const sample = SAMPLE_TICKETS.find((t) => t.key === sampleKey);
  if (!sample) throw new HttpError(400, "Unknown sample ticket");
  const db = adminDb();
  const { data: conn } = await db
    .from("integration_connections")
    .select("provider")
    .eq("organization_id", session.org.id)
    .eq("integration_key", "zendesk")
    .eq("status", "connected")
    .maybeSingle();
  if (conn?.provider !== "sandbox") throw new HttpError(409, "Connect Zendesk in sandbox mode to simulate tickets");
  const ticket = buildSandboxTicket(sample);
  await sandboxStore(db, session.org.id).put("zendesk", "ticket", ticket);
  await activity(session, { actionType: "sandbox_ticket", title: `Sandbox ticket #${ticket.id} received: ${sample.subject}` });
  try {
    const runIds = await dispatchIntegrationEvent(session.org.id, "zendesk.ticket.created", { ticket_id: ticket.id });
    return { ticketId: ticket.id, runIds };
  } catch (e) {
    mapRunError(e);
  }
}

export async function recordFeedback(session: Session, runId: string, verdict: "correct" | "incorrect", expected?: string) {
  const db = adminDb();
  const { data: run } = await db.from("agent_runs").select("id, agent_id").eq("organization_id", session.org.id).eq("id", runId).maybeSingle();
  if (!run) throw new HttpError(404, "Run not found");
  await db
    .from("agent_feedback")
    .upsert(
      { organization_id: session.org.id, agent_id: run.agent_id, agent_run_id: runId, verdict, expected_outcome: expected ?? null, user_id: session.user.id },
      { onConflict: "agent_run_id,user_id" },
    );
  if (verdict === "incorrect") {
    await db.from("human_interventions").insert({
      organization_id: session.org.id,
      agent_id: run.agent_id,
      agent_run_id: runId,
      type: "correction",
      description: expected ? `Marked incorrect: ${expected}` : "Marked incorrect",
      minutes_spent: 0,
      user_id: session.user.id,
    });
    await track(session, "human_override", { run_id: runId });
  }
}
