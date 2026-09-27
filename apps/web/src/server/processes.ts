import "server-only";
import {
  draftProcessInventory,
  sameProcess,
  extractProcessesFromDocument,
  generateWorkflow,
  runDiscoveryTurn,
  suggestInterviewAnswers,
  type CompanyContext,
  type InterviewMessage,
} from "@autonomos/ai";
import { blendScore, deterministicBusinessValue, deterministicDifficulty, deterministicRisk, isThin, qualityGaps, sensitiveAreas, tempered } from "@autonomos/agents";
import { DEPARTMENTS, DiscoveredProcessSchema, tidyTitle, type CompanyProfile, type DiscoveredProcess, type DiscoveredStep } from "@autonomos/schemas";
import { z } from "zod";
import { activity, audit, recordUsage, track } from "@/lib/audit";
import { adminDb, HttpError, type Session } from "@/lib/session";

export async function companyContext(session: Session): Promise<CompanyContext> {
  const { data } = await adminDb().from("integration_connections").select("integration_key, integrations(name)").eq("organization_id", session.org.id).eq("status", "connected");
  return {
    name: session.org.name,
    industry: session.org.industry,
    description: session.org.description,
    summary: session.org.companySummary,
    connectedSystems: (data ?? []).map((c) => (c.integrations as unknown as { name: string } | null)?.name ?? c.integration_key),
  };
}

const usageSink = (session: Session) => (u: Parameters<typeof recordUsage>[1]) => recordUsage(session.org.id, u);

export async function ensureDepartment(session: Session, name: string): Promise<string> {
  const db = adminDb();
  const clean = name.trim() || "Other";
  const { data: existing } = await db.from("departments").select("id").eq("organization_id", session.org.id).ilike("name", clean).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await db.from("departments").insert({ organization_id: session.org.id, name: clean }).select("id").single();
  if (error || !data) throw new Error(`department: ${error?.message}`);
  return data.id;
}

function signalsFrom(p: DiscoveredProcess, hourlyCost: number) {
  const text = `${p.title} ${p.description} ${p.steps.map((s) => s.title).join(" ")}`.toLowerCase();
  return {
    estimatedOccurrencesPerMonth: p.estimatedOccurrencesPerMonth,
    estimatedMinutesPerOccurrence: p.estimatedMinutesPerOccurrence,
    hourlyCost,
    systemsCount: p.systems.length,
    stepsCount: p.steps.length,
    judgementSteps: p.steps.filter((s) => s.requiresJudgement).length,
    riskySteps: p.steps.filter((s) => (s.risk ?? 0) >= 4).length,
    handlesMoney: /refund|payment|invoice|payout|billing|charge/.test(text),
    customerFacing: /customer|client|buyer|ticket|reply/.test(text),
  };
}

async function replaceChildren(processId: string, orgId: string, steps: DiscoveredStep[], systems: string[], roles: string[]) {
  const db = adminDb();
  await Promise.all([
    db.from("process_steps").delete().eq("organization_id", orgId).eq("process_id", processId),
    db.from("process_systems").delete().eq("organization_id", orgId).eq("process_id", processId),
    db.from("process_people").delete().eq("organization_id", orgId).eq("process_id", processId),
  ]);
  if (steps.length) {
    const { error } = await db.from("process_steps").insert(
      steps.map((s, i) => ({
        organization_id: orgId,
        process_id: processId,
        position: i + 1,
        title: s.title,
        description: s.description ?? null,
        performed_by: s.performedBy ?? null,
        system: s.system ?? null,
        action_type: s.actionType ?? null,
        current_automation: null,
        requires_judgement: s.requiresJudgement ?? false,
        risk: s.risk ?? null,
        estimated_duration_minutes: s.estimatedDurationMinutes ?? null,
      })),
    );
    if (error) throw new Error(`steps: ${error.message}`);
  }
  const uniqueSystems = [...new Set(systems.map((s) => s.trim()).filter(Boolean))];
  const uniqueRoles = [...new Set(roles.map((s) => s.trim()).filter(Boolean))];
  if (uniqueSystems.length) await db.from("process_systems").insert(uniqueSystems.map((system) => ({ organization_id: orgId, process_id: processId, system })));
  if (uniqueRoles.length) await db.from("process_people").insert(uniqueRoles.map((role) => ({ organization_id: orgId, process_id: processId, role })));
}

export async function saveDiscoveredProcesses(
  session: Session,
  processes: DiscoveredProcess[],
  source: "interview" | "document" | "integration" | "manual" | "website",
  links: { discoverySessionId?: string; documentId?: string } = {},
): Promise<string[]> {
  const db = adminDb();
  const ids: string[] = [];
  // Discovery runs from several sources (website, interview, documents, systems). The same
  // process found twice is kept once: the first version stays, for the team to refine.
  const { data: existing } = await db.from("processes").select("title").eq("organization_id", session.org.id).neq("status", "archived");
  const known = new Set((existing ?? []).map((e) => e.title.trim().toLowerCase()));
  // Provenance: what kind of data systems-based discovery read (interviews and documents have none).
  let sourceData: "sandbox" | "live" | "mixed" | null = null;
  if (source === "integration" || source === "website") {
    const { data: conns } = await db.from("integration_connections").select("provider").eq("organization_id", session.org.id).eq("status", "connected");
    const kinds = new Set((conns ?? []).map((c) => (c.provider === "sandbox" ? "sandbox" : "live")));
    sourceData = kinds.size === 2 ? "mixed" : kinds.has("live") ? "live" : kinds.has("sandbox") ? "sandbox" : null;
  }
  for (const raw of processes) {
    const parsed = DiscoveredProcessSchema.parse(raw);
    const p = { ...parsed, title: tidyTitle(parsed.title) };
    const key = p.title.trim().toLowerCase();
    if (known.has(key)) continue;
    known.add(key);
    const departmentId = await ensureDepartment(session, p.department);
    const signals = signalsFrom(p, session.org.defaultHourlyCost);
    // Thin drafts (low confidence, no workflow, no numbers) wait as candidates outside the
    // working inventory, with their claimed value and target held back until filled in.
    const thin =
      source !== "manual" &&
      isThin({
        confidence: p.confidence,
        stepsCount: p.steps.length,
        estimatedOccurrencesPerMonth: p.estimatedOccurrencesPerMonth ?? null,
        estimatedMinutesPerOccurrence: p.estimatedMinutesPerOccurrence ?? null,
      });
    const scores = tempered(
      { businessValue: blendScore(deterministicBusinessValue(signals), p.businessValue), potentialAutonomyLevel: p.potentialAutonomyLevel, currentAutonomyLevel: p.currentAutonomyLevel },
      thin,
    );
    const { data, error } = await db
      .from("processes")
      .insert({
        organization_id: session.org.id,
        department_id: departmentId,
        title: p.title,
        description: p.description,
        trigger: p.trigger ?? null,
        frequency: p.frequency ?? "ad_hoc",
        estimated_occurrences_per_month: p.estimatedOccurrencesPerMonth ?? null,
        estimated_minutes_per_occurrence: p.estimatedMinutesPerOccurrence ?? null,
        current_autonomy_level: p.currentAutonomyLevel,
        potential_autonomy_level: scores.potentialAutonomyLevel,
        business_value: scores.businessValue,
        automation_difficulty: blendScore(deterministicDifficulty(signals), p.automationDifficulty),
        risk_level: blendScore(deterministicRisk(signals), p.riskLevel),
        inputs: p.inputs,
        outputs: p.outputs,
        decision_points: p.decisionPoints,
        exceptions: p.exceptions,
        missing_information: p.missingInformation,
        status: thin ? "candidate" : "draft",
        discovery_source: source,
        source_data: sourceData,
        discovery_session_id: links.discoverySessionId ?? null,
        document_id: links.documentId ?? null,
        confidence: p.confidence,
        created_by: session.user.id,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`process: ${error?.message}`);
    await replaceChildren(data.id, session.org.id, p.steps, p.systems, p.roles);
    ids.push(data.id);
    await track(session, "process_created", { source, process_id: data.id });
  }
  if (ids.length) {
    await activity(session, { actionType: "processes_mapped", title: `Mapped ${ids.length} process${ids.length > 1 ? "es" : ""} from ${source}` });
    await audit(session, { action: "processes.created", input: { source, count: ids.length }, output: ids });
  }
  return ids;
}

export const ManualProcessSchema = z.object({
  title: z.string().trim().min(2, "Give the process a name"),
  description: z.string().trim().min(5, "Describe the process in a sentence or two"),
  department: z.string().trim().min(1),
  generate: z.boolean().default(true),
});

export async function createManualProcess(session: Session, input: z.infer<typeof ManualProcessSchema>) {
  const base: DiscoveredProcess = {
    title: input.title,
    description: input.description,
    department: input.department,
    systems: [],
    roles: [],
    steps: [],
    inputs: [],
    outputs: [],
    decisionPoints: [],
    exceptions: [],
    currentAutonomyLevel: 1,
    potentialAutonomyLevel: 3,
    businessValue: 3,
    automationDifficulty: 3,
    riskLevel: 2,
    missingInformation: ["How often does this happen?", "How long does it take each time?"],
    confidence: 0.5,
  };
  if (input.generate) {
    const wf = await generateWorkflow({
      company: await companyContext(session),
      title: input.title,
      description: input.description,
      department: input.department,
      onUsage: usageSink(session),
    });
    base.steps = wf.steps;
    base.systems = wf.systems;
    base.roles = wf.roles;
    base.trigger = wf.trigger;
    if (input.department === "Detect") base.department = wf.department ?? "Operations";
    base.frequency = wf.frequency;
    base.estimatedOccurrencesPerMonth = wf.estimatedOccurrencesPerMonth;
    base.estimatedMinutesPerOccurrence = wf.estimatedMinutesPerOccurrence;
    if (wf.estimatedOccurrencesPerMonth && wf.estimatedMinutesPerOccurrence) base.missingInformation = ["Confirm the estimated volume and time per occurrence"];
  }
  if (base.department === "Detect") base.department = "Operations";
  const [id] = await saveDiscoveredProcesses(session, [base], "manual");
  if (id) return id;
  // Already in the inventory under this name: open that one instead of creating a duplicate.
  const { data: existing } = await adminDb().from("processes").select("id").eq("organization_id", session.org.id).ilike("title", input.title.trim()).neq("status", "archived").limit(1).maybeSingle();
  if (!existing) throw new HttpError(409, "Could not create the process");
  return existing.id;
}

export const ProcessUpdateSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim(),
  departmentId: z.string().uuid().nullable(),
  trigger: z.string().trim().nullable(),
  frequency: z.enum(["ad_hoc", "daily", "weekly", "monthly", "event_driven"]),
  estimatedOccurrencesPerMonth: z.number().nonnegative().nullable(),
  estimatedMinutesPerOccurrence: z.number().nonnegative().nullable(),
  currentAutonomyLevel: z.number().int().min(1).max(5),
  potentialAutonomyLevel: z.number().int().min(1).max(5),
  businessValue: z.number().int().min(1).max(5),
  automationDifficulty: z.number().int().min(1).max(5),
  riskLevel: z.number().int().min(1).max(5),
  notes: z.string().nullable(),
  steps: z.array(z.object({ title: z.string().trim().min(1), system: z.string().optional(), performedBy: z.string().optional(), requiresJudgement: z.boolean().optional() })),
  systems: z.array(z.string()),
  roles: z.array(z.string()),
});

export async function updateProcess(session: Session, id: string, input: z.infer<typeof ProcessUpdateSchema>) {
  const db = adminDb();
  const { data: existing } = await db.from("processes").select("id, status").eq("organization_id", session.org.id).eq("id", id).maybeSingle();
  if (!existing) throw new HttpError(404, "Process not found");
  const { error } = await db
    .from("processes")
    .update({
      title: input.title,
      description: input.description,
      department_id: input.departmentId,
      trigger: input.trigger,
      frequency: input.frequency,
      estimated_occurrences_per_month: input.estimatedOccurrencesPerMonth,
      estimated_minutes_per_occurrence: input.estimatedMinutesPerOccurrence,
      current_autonomy_level: input.currentAutonomyLevel,
      potential_autonomy_level: input.potentialAutonomyLevel,
      business_value: input.businessValue,
      automation_difficulty: input.automationDifficulty,
      risk_level: input.riskLevel,
      notes: input.notes,
      missing_information: [],
      // A person has now written or checked the details, so the AI's confidence no longer applies.
      confidence: null,
    })
    .eq("organization_id", session.org.id)
    .eq("id", id);
  if (error) throw new Error(error.message);
  await replaceChildren(id, session.org.id, input.steps, input.systems, input.roles);
  // A candidate that now has its workflow and numbers joins the inventory as a draft.
  if (
    existing.status === "candidate" &&
    !isThin({ confidence: null, stepsCount: input.steps.length, estimatedOccurrencesPerMonth: input.estimatedOccurrencesPerMonth, estimatedMinutesPerOccurrence: input.estimatedMinutesPerOccurrence })
  ) {
    await db.from("processes").update({ status: "draft" }).eq("organization_id", session.org.id).eq("id", id);
  }
  await audit(session, { action: "process.updated", processId: id, input });
}

// What stands between a process and approval, and whether it needs a compliance owner.
export async function processGate(session: Session, id: string) {
  const db = adminDb();
  const { data: p } = await db
    .from("processes")
    .select("title, description, status, confidence, estimated_occurrences_per_month, estimated_minutes_per_occurrence, compliance_owner, process_steps(title)")
    .eq("organization_id", session.org.id)
    .eq("id", id)
    .maybeSingle();
  if (!p) throw new HttpError(404, "Process not found");
  const steps = (p.process_steps as unknown as Array<{ title: string }> | null) ?? [];
  const gaps = qualityGaps({
    confidence: p.confidence === null ? null : Number(p.confidence),
    stepsCount: steps.length,
    estimatedOccurrencesPerMonth: p.estimated_occurrences_per_month === null ? null : Number(p.estimated_occurrences_per_month),
    estimatedMinutesPerOccurrence: p.estimated_minutes_per_occurrence === null ? null : Number(p.estimated_minutes_per_occurrence),
  });
  const sensitive = sensitiveAreas(`${p.title} ${p.description} ${steps.map((s) => s.title).join(" ")}`);
  return { gaps, sensitive, complianceOwner: p.compliance_owner, status: p.status };
}

// Records who signs off on compliance for a process in a sensitive area.
export async function setComplianceOwner(session: Session, id: string, owner: string) {
  const name = owner.trim().slice(0, 120);
  if (name.length < 2) throw new HttpError(400, "Name the person or team who signs off on compliance");
  const { error } = await adminDb()
    .from("processes")
    .update({ compliance_owner: name, compliance_confirmed_at: new Date().toISOString(), compliance_confirmed_by: session.user.id })
    .eq("organization_id", session.org.id)
    .eq("id", id);
  if (error) throw new Error(error.message);
  await audit(session, { action: "process.compliance_owner_set", processId: id, input: { owner: name } });
}

export async function setProcessStatus(session: Session, id: string, status: "reviewed" | "active" | "archived" | "draft") {
  const db = adminDb();
  // Approval means the process is real and described: no approving thin drafts or candidates.
  if (status === "reviewed") {
    const gate = await processGate(session, id);
    if (gate.gaps.length) throw new HttpError(409, `Fill in the details before approving: ${gate.gaps.join("; ")}.`);
  }
  const { data, error } = await db
    .from("processes")
    .update({
      status,
      ...(status === "reviewed" ? { reviewed_by: session.user.id, reviewed_at: new Date().toISOString() } : {}),
    })
    .eq("organization_id", session.org.id)
    .eq("id", id)
    .select("id, title, department_id")
    .single();
  if (error || !data) throw new HttpError(404, "Process not found");
  await audit(session, { action: `process.${status}`, processId: id });
  await activity(session, { actionType: `process_${status}`, title: `${data.title} marked ${status}`, processId: id, departmentId: data.department_id });
  if (status === "reviewed") await track(session, "process_reviewed", { process_id: id });
}

// ---------------------------------------------------------------------------
// Guided interview (PRD section 16)
// ---------------------------------------------------------------------------

export function openingQuestion(department: string, findings: string[] = []) {
  if (findings.length) {
    return `I read your connected systems. For ${department} they show: ${findings.slice(0, 3).join("; ")}. Is that right? Walk me through what happens in the first one, and tell me what else the team does that is not in these systems.`;
  }
  return `Let's start with ${department}. What are the main things your team repeatedly does each week?`;
}

// What the latest system discovery found for a department.
async function foundFor(session: Session, department: string) {
  const { latestDiscoveryRun } = await import("@/server/system-discovery");
  const run = await latestDiscoveryRun(session);
  if (!run || run.status !== "ready") return [];
  return run.proposals.filter((p) => p.department.toLowerCase() === department.toLowerCase());
}

// The same, as short lines for questions and prompts.
async function findingsFor(session: Session, department: string): Promise<string[]> {
  return (await foundFor(session, department)).map((p) => `${p.title.toLowerCase()} (${p.evidence[0] ? `${p.evidence[0].source}: ${p.evidence[0].detail}` : "seen in your data"})`);
}

export async function startInterview(session: Session, department: string) {
  const findings = await findingsFor(session, department);
  const opening = openingQuestion(department, findings);
  const { data, error } = await adminDb()
    .from("discovery_sessions")
    .insert({
      organization_id: session.org.id,
      method: "interview",
      department_name: department,
      messages: [{ role: "assistant", content: opening }],
      created_by: session.user.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`interview: ${error?.message}`);
  await track(session, "process_discovery_started", { method: "interview", department });
  const suggestions = await Promise.race([
    interviewSuggestions(session, department, [{ role: "assistant", content: opening }]),
    new Promise<string[]>((r) => setTimeout(() => r([]), SUGGESTIONS_BUDGET_MS)),
  ]);
  if (suggestions.length) await adminDb().from("discovery_sessions").update({ suggestions }).eq("id", data.id);
  return { id: data.id, opening, suggestions };
}

// One-tap answers for the interview, grounded in the company profile. Never blocks the interview.
async function interviewSuggestions(session: Session, department: string, messages: InterviewMessage[]): Promise<string[]> {
  try {
    return await suggestInterviewAnswers({
      company: await companyContext(session),
      department,
      messages,
      likelyProcesses: [...(await foundFor(session, department)).map((p) => ({ title: p.title, department: p.department })), ...(session.org.websiteProfile?.likelyProcesses ?? [])],
      onUsage: usageSink(session),
    });
  } catch (e) {
    console.error("interview suggestions failed", e);
    return [];
  }
}

// Answers run as a background turn on the server (see the discover actions), and the page
// polls interviewState. A turn that runs past TURN_TIMEOUT_MS is reported as failed, so the
// page never waits without an end; Retry runs it again and Cancel takes the answer back.
export const TURN_TIMEOUT_MS = 100_000;
const SUGGESTIONS_BUDGET_MS = 8_000;

export type InterviewState = {
  id: string;
  department: string;
  status: "open" | "completed";
  messages: InterviewMessage[];
  processes: DiscoveredProcess[];
  suggestions: string[];
  // Seconds the current answer has been worked on, measured on the server.
  pending: { answer: string; elapsed: number } | null;
  failed: { answer: string; message: string } | null;
};

type SessionRow = {
  id: string;
  department_name: string | null;
  status: string;
  messages: unknown;
  extracted: unknown;
  suggestions: unknown;
  pending_answer: string | null;
  pending_since: string | null;
  turn_error: string | null;
};

async function loadInterview(session: Session, sessionId: string): Promise<SessionRow> {
  const { data } = await adminDb()
    .from("discovery_sessions")
    .select("id, department_name, status, messages, extracted, suggestions, pending_answer, pending_since, turn_error")
    .eq("organization_id", session.org.id)
    .eq("method", "interview")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data) throw new HttpError(404, "Interview not found");
  return data;
}

const turnAge = (since: string) => Date.now() - new Date(since).getTime();
const TIMED_OUT = "This took longer than expected, so it was stopped. Retry, or save what was found so far.";

function toState(s: SessionRow): InterviewState {
  const inFlight = s.pending_since && !s.turn_error ? s.pending_since : null;
  return {
    id: s.id,
    department: s.department_name ?? "Operations",
    status: s.status === "open" ? "open" : "completed",
    messages: (s.messages as InterviewMessage[]) ?? [],
    processes: (s.extracted as DiscoveredProcess[]) ?? [],
    suggestions: inFlight ? [] : ((s.suggestions as string[]) ?? []),
    pending: inFlight && s.pending_answer !== null ? { answer: s.pending_answer, elapsed: Math.max(0, Math.round(turnAge(inFlight) / 1000)) } : null,
    failed: s.turn_error && s.pending_answer !== null ? { answer: s.pending_answer, message: s.turn_error } : null,
  };
}

export async function interviewState(session: Session, sessionId: string): Promise<InterviewState> {
  const s = await loadInterview(session, sessionId);
  if (s.pending_since && !s.turn_error && turnAge(s.pending_since) > TURN_TIMEOUT_MS) {
    // The token stays, so a result that still arrives is kept; Retry or Cancel replaces it.
    await adminDb().from("discovery_sessions").update({ turn_error: TIMED_OUT }).eq("id", sessionId).eq("pending_since", s.pending_since);
    s.turn_error = TIMED_OUT;
  }
  return toState(s);
}

// Records the answer and marks the turn in flight. Returns the token for runInterviewTurn.
export async function submitInterviewAnswer(session: Session, sessionId: string, answer: string) {
  const text = answer.trim().slice(0, 6000);
  if (!text) throw new HttpError(400, "Write an answer first");
  const s = await loadInterview(session, sessionId);
  if (s.status !== "open") throw new HttpError(409, "This interview is finished");
  if (s.pending_since && !s.turn_error && turnAge(s.pending_since) < TURN_TIMEOUT_MS) throw new HttpError(409, "Still working on the last answer");
  const since = new Date().toISOString();
  const messages = [...((s.messages as InterviewMessage[]) ?? []), { role: "user" as const, content: text }];
  await adminDb()
    .from("discovery_sessions")
    .update({ messages: messages as never, pending_answer: text, pending_since: since, turn_error: null, suggestions: [] })
    .eq("id", sessionId);
  return { since, state: toState({ ...s, messages, pending_answer: text, pending_since: since, turn_error: null, suggestions: [] }) };
}

// Runs the failed or timed-out turn again with the same answer.
export async function retryInterviewTurn(session: Session, sessionId: string) {
  const s = await loadInterview(session, sessionId);
  if (s.status !== "open") throw new HttpError(409, "This interview is finished");
  if (s.pending_answer === null) throw new HttpError(409, "There is nothing to retry");
  if (s.pending_since && !s.turn_error && turnAge(s.pending_since) < TURN_TIMEOUT_MS) throw new HttpError(409, "Still working on the last answer");
  const since = new Date().toISOString();
  await adminDb().from("discovery_sessions").update({ pending_since: since, turn_error: null }).eq("id", sessionId);
  return { since, state: toState({ ...s, pending_since: since, turn_error: null }) };
}

// Takes the answer back: drops it from the conversation and discards any result still coming.
export async function cancelInterviewTurn(session: Session, sessionId: string) {
  const s = await loadInterview(session, sessionId);
  const answer = s.pending_answer;
  const messages = (s.messages as InterviewMessage[]) ?? [];
  const last = messages.at(-1);
  const kept = answer !== null && last?.role === "user" && last.content === answer ? messages.slice(0, -1) : messages;
  await adminDb()
    .from("discovery_sessions")
    .update({ messages: kept as never, pending_answer: null, pending_since: null, turn_error: null })
    .eq("id", sessionId);
  return { answer: answer ?? "", state: toState({ ...s, messages: kept, pending_answer: null, pending_since: null, turn_error: null }) };
}

// The turn itself, after the response. Every write is conditional on the token, so a turn
// that was cancelled or retried in the meantime changes nothing.
export async function runInterviewTurn(session: Session, sessionId: string, since: string) {
  const db = adminDb();
  const s = await loadInterview(session, sessionId).catch(() => null);
  // Postgres gives the time back in its own format, so compare instants, not strings.
  if (!s?.pending_since || new Date(s.pending_since).getTime() !== new Date(since).getTime()) return;
  const department = s.department_name ?? "Operations";
  const messages = (s.messages as InterviewMessage[]) ?? [];
  try {
    const turn = await runDiscoveryTurn({
      company: await companyContext(session),
      department,
      messages,
      existingProcesses: (s.extracted as DiscoveredProcess[]) ?? [],
      systemFindings: await findingsFor(session, department),
      onUsage: usageSink(session),
    });
    const next = turn.done || !turn.nextQuestion ? "That gives me a good picture. Review the processes below and save them to your inventory." : turn.nextQuestion;
    const updated = [...messages, { role: "assistant" as const, content: next }];
    const suggestions = await Promise.race([interviewSuggestions(session, department, updated), new Promise<string[]>((r) => setTimeout(() => r([]), SUGGESTIONS_BUDGET_MS))]);
    await db
      .from("discovery_sessions")
      .update({ messages: updated as never, extracted: turn.processes as never, suggestions, pending_answer: null, pending_since: null, turn_error: null })
      .eq("id", sessionId)
      .eq("pending_since", since);
  } catch (e) {
    console.error("interview turn failed", e);
    const message = /timeout|timed out|abort/i.test(e instanceof Error ? `${e.name} ${e.message}` : "") ? TIMED_OUT : "The AI model did not answer. Retry, or save what was found so far.";
    await db.from("discovery_sessions").update({ turn_error: message }).eq("id", sessionId).eq("pending_since", since);
  }
}

// The API's answer: the same turn, waited for in the request.
export async function answerInterview(session: Session, sessionId: string, answer: string) {
  const { since } = await submitInterviewAnswer(session, sessionId, answer);
  await runInterviewTurn(session, sessionId, since);
  const state = await interviewState(session, sessionId);
  if (state.failed) throw new HttpError(502, state.failed.message);
  return { messages: state.messages, processes: state.processes, suggestions: state.suggestions };
}

// An interview this person left open in the last day, to pick up where they stopped.
export async function openInterviewFor(session: Session): Promise<{ id: string; department: string; answers: number } | null> {
  const { data } = await adminDb()
    .from("discovery_sessions")
    .select("id, department_name, messages")
    .eq("organization_id", session.org.id)
    .eq("method", "interview")
    .eq("status", "open")
    .eq("created_by", session.user.id)
    .gte("updated_at", new Date(Date.now() - 86_400_000).toISOString())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const answers = ((data.messages as InterviewMessage[]) ?? []).filter((m) => m.role === "user").length;
  return answers ? { id: data.id, department: data.department_name ?? "Operations", answers } : null;
}

export async function finishInterview(session: Session, sessionId: string, selectedTitles?: string[]) {
  const db = adminDb();
  const { data: s } = await db.from("discovery_sessions").select("*").eq("organization_id", session.org.id).eq("id", sessionId).maybeSingle();
  if (!s) throw new HttpError(404, "Interview not found");
  if (s.status !== "open") throw new HttpError(409, "This interview was already saved");
  const all = (s.extracted as DiscoveredProcess[]) ?? [];
  const chosen = selectedTitles ? all.filter((p) => selectedTitles.includes(p.title)) : all;
  const ids = await saveDiscoveredProcesses(session, chosen, "interview", { discoverySessionId: sessionId });
  await db.from("discovery_sessions").update({ status: "completed" }).eq("organization_id", session.org.id).eq("id", sessionId);
  return ids;
}

// ---------------------------------------------------------------------------
// Document import (PRD section 17)
// ---------------------------------------------------------------------------

export const DocumentImportSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(40, "Paste or upload at least a paragraph of the document"),
  source: z.enum(["upload", "paste", "google_drive", "notion"]).default("paste"),
});

export async function importDocument(session: Session, input: z.infer<typeof DocumentImportSchema>) {
  const db = adminDb();
  const content = input.content.slice(0, 200_000);
  const { data: doc, error } = await db
    .from("documents")
    .insert({ organization_id: session.org.id, title: input.title, source: input.source, content, created_by: session.user.id })
    .select("id")
    .single();
  if (error || !doc) throw new Error(`document: ${error?.message}`);
  await track(session, "process_discovery_started", { method: "document" });
  const processes = await extractProcessesFromDocument({ company: await companyContext(session), title: input.title, content, onUsage: usageSink(session) });
  const ids = await saveDiscoveredProcesses(session, processes, "document", { documentId: doc.id });
  return { documentId: doc.id, processIds: ids };
}

// ---------------------------------------------------------------------------
// Integration-assisted discovery (PRD section 18). Reads a recent, redacted sample of each
// connected system (sandbox or live) and describes it; see server/system-discovery.ts.
// ---------------------------------------------------------------------------

export async function connectedSystemEvidence(session: Session): Promise<string[]> {
  const { readConnectedSystems } = await import("@/server/system-discovery");
  return readConnectedSystems(session);
}

// One-shot version for the API: read every system, propose, and keep the confident proposals.
export async function discoverFromIntegrations(session: Session) {
  const { acceptProposals, proposeFromRun, scanRunSystem, startDiscoveryRun } = await import("@/server/system-discovery");
  const run = await startDiscoveryRun(session);
  for (const s of run.systems.filter((x) => x.state === "pending")) await scanRunSystem(session, run.id, s.key);
  const ready = await proposeFromRun(session, run.id);
  const titles = ready.proposals.filter((p) => !p.exists && p.confidence >= 0.5).map((p) => p.title);
  return titles.length ? acceptProposals(session, run.id, titles) : [];
}

// ---------------------------------------------------------------------------
// First inventory, drafted without asking: from the website profile and whatever
// systems were connected during onboarding. Everything lands as a draft to review.
// ---------------------------------------------------------------------------

// Processes this workspace said it does not run; discovery never proposes them again.
export async function rejectedTitles(session: Session): Promise<string[]> {
  const { data } = await adminDb().from("rejected_processes").select("title").eq("organization_id", session.org.id);
  return (data ?? []).map((r) => r.title);
}

// `evidence` can be passed in when the systems were already read (the onboarding progress page reads them one by one).
export async function draftInitialInventory(session: Session, evidence?: string[]): Promise<string[]> {
  const profile = session.org.websiteProfile;
  evidence ??= await connectedSystemEvidence(session);
  const areas = (session.org.improvementAreas.length ? session.org.improvementAreas : ["Operations"]) as Array<(typeof DEPARTMENTS)[number]>;
  const processes = await draftProcessInventory({
    company: await companyContext(session),
    profile: profile ?? {
      summary: session.org.companySummary ?? session.org.description ?? session.org.name,
      industry: (session.org.industry ?? "Other") as CompanyProfile["industry"],
      customers: null,
      improvementAreas: areas,
      likelyProcesses: [],
    },
    evidence,
    onUsage: usageSink(session),
  });
  const rejected = await rejectedTitles(session);
  await track(session, "process_discovery_started", { method: "website" });
  return saveDiscoveredProcesses(
    session,
    processes.filter((p) => !rejected.some((r) => sameProcess(r, p.title))),
    profile ? "website" : "integration",
  );
}
