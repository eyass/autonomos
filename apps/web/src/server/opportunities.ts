import "server-only";
import { policyForTools } from "@autonomos/agents";
import type { AgentConfig } from "@autonomos/schemas";
import { generateAgentDraft, generateOpportunities, type ProcessForAnalysis } from "@autonomos/ai";
import { blendScore, opportunityScore } from "@autonomos/agents";
import { toolsForIntegrations } from "@autonomos/integrations";
import type { AutonomyLevel } from "@autonomos/schemas";
import { activity, audit, recordUsage, track } from "@/lib/audit";
import { adminDb, HttpError, type Session } from "@/lib/session";
import { companyContext, connectedSystemEvidence } from "./processes";

export async function loadProcessForAnalysis(session: Session, processId: string) {
  const db = adminDb();
  const { data: p } = await db
    .from("processes")
    .select("*, departments(name, hourly_labour_cost), process_steps(*), process_systems(system), process_people(role)")
    .eq("organization_id", session.org.id)
    .eq("id", processId)
    .maybeSingle();
  if (!p) throw new HttpError(404, "Process not found");
  const dept = p.departments as unknown as { name: string; hourly_labour_cost: number | null } | null;
  const steps = ((p.process_steps as unknown as Array<{ position: number; title: string; system: string | null; performed_by: string | null; requires_judgement: boolean }>) ?? []).sort(
    (a, b) => a.position - b.position,
  );
  const analysis: ProcessForAnalysis = {
    title: p.title,
    description: p.description,
    department: dept?.name ?? "Other",
    trigger: p.trigger,
    frequency: p.frequency,
    estimatedOccurrencesPerMonth: p.estimated_occurrences_per_month === null ? null : Number(p.estimated_occurrences_per_month),
    estimatedMinutesPerOccurrence: p.estimated_minutes_per_occurrence === null ? null : Number(p.estimated_minutes_per_occurrence),
    currentAutonomyLevel: p.current_autonomy_level,
    potentialAutonomyLevel: p.potential_autonomy_level,
    businessValue: p.business_value,
    automationDifficulty: p.automation_difficulty,
    riskLevel: p.risk_level,
    systems: ((p.process_systems as unknown as Array<{ system: string }>) ?? []).map((s) => s.system),
    roles: ((p.process_people as unknown as Array<{ role: string }>) ?? []).map((r) => r.role),
    steps: steps.map((s) => ({ title: s.title, system: s.system, performedBy: s.performed_by, requiresJudgement: s.requires_judgement })),
    exceptions: p.exceptions,
    decisionPoints: p.decision_points,
    proposedAutomation: p.proposed_automation,
  };
  const hourlyCost = dept?.hourly_labour_cost === null || dept?.hourly_labour_cost === undefined ? session.org.defaultHourlyCost : Number(dept.hourly_labour_cost);
  return { row: p, analysis, hourlyCost };
}

export async function generateOpportunitiesForProcess(session: Session, processId: string) {
  const { row, analysis, hourlyCost } = await loadProcessForAnalysis(session, processId);
  if (row.status === "draft") throw new HttpError(409, "Review the process before generating opportunities");
  const generated = await generateOpportunities({
    company: await companyContext(session),
    process: analysis,
    hourlyCost,
    systemEvidence: await connectedSystemEvidence(session),
    onUsage: (u) => recordUsage(session.org.id, u),
  });
  const db = adminDb();
  const ids: string[] = [];
  for (const o of generated) {
    const current = Math.max(1, Math.min(5, o.currentAutonomyLevel)) as AutonomyLevel;
    const target = Math.max(current, Math.min(5, o.targetAutonomyLevel)) as AutonomyLevel;
    // Deterministic process scores anchor the model's opportunity estimates.
    const businessValue = blendScore(row.business_value, o.businessValue);
    const difficulty = blendScore(row.automation_difficulty, o.automationDifficulty);
    const risk = blendScore(row.risk_level, o.riskLevel);
    const hours = o.estimatedHoursSavedMonthly ?? null;
    const { data, error } = await db
      .from("automation_opportunities")
      .insert({
        organization_id: session.org.id,
        process_id: processId,
        department_id: row.department_id,
        title: o.title,
        description: o.description,
        problem: o.problem,
        proposed_future_state: o.proposedFutureState,
        future_state_steps: o.futureStateSteps as never,
        proposed_agent: o.proposedAgent as never,
        expected_outcome: o.proposedFutureState,
        current_autonomy_level: current,
        target_autonomy_level: target,
        business_value_score: businessValue,
        automation_difficulty_score: difficulty,
        risk_score: risk,
        opportunity_score: opportunityScore({ businessValue, automationDifficulty: difficulty, currentAutonomyLevel: current, targetAutonomyLevel: target }),
        estimated_hours_saved_monthly: hours,
        estimated_cost_saved_monthly: hours === null ? null : Math.round(hours * hourlyCost),
        estimated_build_complexity: difficulty <= 2 ? "Low" : difficulty === 3 ? "Medium" : "High",
        required_integrations: o.requiredSystems,
        required_approvals: o.requiredHumanApprovals,
        human_involvement: o.humanInvolvement,
        major_risks: o.majorRisks,
        rationale: o.rationale,
        evidence: (o.evidence ?? []) as never,
        recommended_next_step: "Review the proposed agent",
        template_key: /refund/i.test(analysis.title) ? "refund_handling" : null,
        created_by: session.user.id,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`opportunity: ${error?.message}`);
    ids.push(data.id);
    await track(session, "opportunity_generated", { opportunity_id: data.id, process_id: processId });
  }
  await activity(session, { actionType: "opportunities_generated", title: `Found ${ids.length} automation opportunit${ids.length === 1 ? "y" : "ies"} in ${analysis.title}`, processId });
  await audit(session, { action: "opportunities.generated", processId, output: ids });
  return ids;
}

export type OpportunityStatus = "suggested" | "reviewing" | "approved" | "building" | "live" | "rejected" | "archived";

export async function setOpportunityStatus(session: Session, id: string, status: OpportunityStatus) {
  const { data, error } = await adminDb().from("automation_opportunities").update({ status }).eq("organization_id", session.org.id).eq("id", id).select("id, title").single();
  if (error || !data) throw new HttpError(404, "Opportunity not found");
  await audit(session, { action: `opportunity.${status}`, input: { id } });
  await activity(session, { actionType: `opportunity_${status}`, title: `${data.title}: ${OPPORTUNITY_STATUS_WORDS[status]}` });
  if (status === "approved") await track(session, "opportunity_approved", { opportunity_id: id });
}

const OPPORTUNITY_STATUS_WORDS: Record<OpportunityStatus, string> = {
  suggested: "reopened",
  reviewing: "put on hold",
  approved: "approved",
  building: "back to building",
  live: "live",
  rejected: "rejected",
  archived: "marked done",
};

export async function connectedIntegrationKeys(session: Session) {
  const { data } = await adminDb().from("integration_connections").select("integration_key").eq("organization_id", session.org.id).eq("status", "connected");
  return (data ?? []).map((c) => c.integration_key);
}

export async function draftAgentForOpportunity(session: Session, opportunityId: string) {
  const db = adminDb();
  const { data: o } = await db.from("automation_opportunities").select("*").eq("organization_id", session.org.id).eq("id", opportunityId).maybeSingle();
  if (!o) throw new HttpError(404, "Opportunity not found");
  const { analysis } = await loadProcessForAnalysis(session, o.process_id);
  const connected = await connectedIntegrationKeys(session);
  const tools = toolsForIntegrations(connected);
  const draft = await generateAgentDraft({
    company: await companyContext(session),
    process: analysis,
    opportunity: { title: o.title, description: o.description, proposedAgent: o.proposed_agent, targetAutonomyLevel: o.target_autonomy_level, requiredApprovals: o.required_approvals },
    availableTools: tools.map((t) => ({ key: t.key, description: t.description, access: t.access, integration: t.integration })),
    onUsage: (u) => recordUsage(session.org.id, u),
  });
  return { opportunity: o, draft, connected };
}

// The agent configuration AutonomOS proposes for an opportunity. The wizard starts from it,
// and "Build and test agent" uses it as-is (every write is still simulated in the test).
export async function defaultAgentConfig(session: Session, opportunityId: string) {
  const { opportunity: o, draft, connected } = await draftAgentForOpportunity(session, opportunityId);
  // Start one level below the target for anything involving money; the user can raise it.
  const level = Math.max(2, Math.min(o.target_autonomy_level, draft.suggestedTools.includes("stripe.create_refund") ? 3 : o.target_autonomy_level, 4)) as AgentConfig["autonomyLevel"];
  const config: AgentConfig = {
    name: draft.name,
    description: o.description,
    autonomyLevel: level,
    instructions: draft.instructions,
    trigger: draft.suggestedTrigger,
    tools: draft.suggestedTools,
    policy: policyForTools(draft.suggestedTools, level),
    successCriteria: draft.successCriteria,
    modelConfig: { modelClass: "AGENT_MODEL" },
  };
  return { opportunity: o, config, connected };
}
