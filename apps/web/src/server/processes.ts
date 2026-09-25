import "server-only";
import {
  extractProcessesFromDocument,
  generateWorkflow,
  runDiscoveryTurn,
  type CompanyContext,
  type InterviewMessage,
} from "@autonomos/ai";
import { blendScore, deterministicBusinessValue, deterministicDifficulty, deterministicRisk } from "@autonomos/agents";
import { DiscoveredProcessSchema, type DiscoveredProcess, type DiscoveredStep } from "@autonomos/schemas";
import { z } from "zod";
import { activity, audit, recordUsage, track } from "@/lib/audit";
import { adminDb, HttpError, type Session } from "@/lib/session";

export async function companyContext(session: Session): Promise<CompanyContext> {
  const { data } = await adminDb()
    .from("integration_connections")
    .select("integration_key, integrations(name)")
    .eq("organization_id", session.org.id)
    .eq("status", "connected");
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
  const { data: existing } = await db
    .from("departments")
    .select("id")
    .eq("organization_id", session.org.id)
    .ilike("name", clean)
    .maybeSingle();
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
  source: "interview" | "document" | "integration" | "manual",
  links: { discoverySessionId?: string; documentId?: string } = {},
): Promise<string[]> {
  const db = adminDb();
  const ids: string[] = [];
  for (const raw of processes) {
    const p = DiscoveredProcessSchema.parse(raw);
    const departmentId = await ensureDepartment(session, p.department);
    const signals = signalsFrom(p, session.org.defaultHourlyCost);
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
        potential_autonomy_level: p.potentialAutonomyLevel,
        business_value: blendScore(deterministicBusinessValue(signals), p.businessValue),
        automation_difficulty: blendScore(deterministicDifficulty(signals), p.automationDifficulty),
        risk_level: blendScore(deterministicRisk(signals), p.riskLevel),
        inputs: p.inputs,
        outputs: p.outputs,
        decision_points: p.decisionPoints,
        exceptions: p.exceptions,
        missing_information: p.missingInformation,
        status: "draft",
        discovery_source: source,
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
  }
  const [id] = await saveDiscoveredProcesses(session, [base], "manual");
  return id!;
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
    })
    .eq("organization_id", session.org.id)
    .eq("id", id);
  if (error) throw new Error(error.message);
  await replaceChildren(id, session.org.id, input.steps, input.systems, input.roles);
  await audit(session, { action: "process.updated", processId: id, input });
}

export async function setProcessStatus(session: Session, id: string, status: "reviewed" | "active" | "archived" | "draft") {
  const db = adminDb();
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

export function openingQuestion(department: string) {
  return `Let's start with ${department}. What are the main things your team repeatedly does each week?`;
}

export async function startInterview(session: Session, department: string) {
  const { data, error } = await adminDb()
    .from("discovery_sessions")
    .insert({
      organization_id: session.org.id,
      method: "interview",
      department_name: department,
      messages: [{ role: "assistant", content: openingQuestion(department) }],
      created_by: session.user.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`interview: ${error?.message}`);
  await track(session, "process_discovery_started", { method: "interview", department });
  return data.id;
}

export async function answerInterview(session: Session, sessionId: string, answer: string) {
  const db = adminDb();
  const { data: s } = await db.from("discovery_sessions").select("*").eq("organization_id", session.org.id).eq("id", sessionId).maybeSingle();
  if (!s) throw new HttpError(404, "Interview not found");
  if (s.status !== "open") throw new HttpError(409, "This interview is finished");
  const messages = [...((s.messages as InterviewMessage[]) ?? []), { role: "user" as const, content: answer.slice(0, 6000) }];
  const turn = await runDiscoveryTurn({
    company: await companyContext(session),
    department: s.department_name ?? "Operations",
    messages,
    existingProcesses: (s.extracted as DiscoveredProcess[]) ?? [],
    onUsage: usageSink(session),
  });
  const next = turn.done || !turn.nextQuestion ? "That gives me a good picture. Review the processes below and save them to your inventory." : turn.nextQuestion;
  const updated = [...messages, { role: "assistant" as const, content: next }];
  await db
    .from("discovery_sessions")
    .update({ messages: updated as never, extracted: turn.processes as never })
    .eq("organization_id", session.org.id)
    .eq("id", sessionId);
  return { messages: updated, processes: turn.processes, done: turn.done };
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
