import "server-only";
import { generatePlaybook } from "@autonomos/ai";
import { AgentConfigSchema, DEPARTMENTS, type AgentConfig, type PlaybookDraft } from "@autonomos/schemas";
import { policyForTools, sensitiveAreas } from "@autonomos/agents";
import {
  BUILTIN_INTEGRATIONS,
  composioToolsFor,
  getTool,
  getToolkit,
  integrationKeyFor,
  POPULAR_TOOLKITS,
  registerSnapshots,
  snapshotOf,
  toolkitFor,
  toolsForIntegrations,
  type ToolDefinition,
  type ToolSnapshot,
} from "@autonomos/integrations";
import { audit, activity, recordUsage } from "@/lib/audit";
import { adminDb, HttpError, type Session } from "@/lib/session";
import { confirmProcess, saveDiscoveredProcesses, setProcessStatus } from "@/server/processes";

// Ready-made playbooks: templates the site's administrators draft with AI for a tool, review and
// publish, and every workspace can start from. Only site administrators (PLATFORM_ADMIN_EMAILS)
// write them; the server checks it on every change.

export function isPlatformAdmin(session: Pick<Session, "user">): boolean {
  const list = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(session.user.email) && list.includes(session.user.email.toLowerCase());
}

export function requirePlatformAdmin(session: Session) {
  if (!isPlatformAdmin(session)) throw new HttpError(403, "Only site administrators can manage playbooks");
}

export type PlaybookAgent = PlaybookDraft["agent"];
export type PlaybookRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  department: string;
  toolkits: string[];
  trigger: string | null;
  steps: PlaybookDraft["steps"];
  agent: PlaybookAgent;
  tool_snapshots: ToolSnapshot[];
  estimated_minutes_per_occurrence: number | null;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
};

const asRow = (r: Record<string, unknown>) =>
  ({ ...r, estimated_minutes_per_occurrence: r.estimated_minutes_per_occurrence === null ? null : Number(r.estimated_minutes_per_occurrence) }) as unknown as PlaybookRow;

// The tools a playbook for this system may use: its built-in tools, or its Composio actions.
async function toolsForToolkit(key: string): Promise<ToolDefinition[]> {
  const own = BUILTIN_INTEGRATIONS.has(key) ? toolsForIntegrations([key]).filter((t) => t.integration === key) : await composioToolsFor(key);
  return [...own, ...toolsForIntegrations([]).filter((t) => t.integration === "knowledge")];
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

// Drafts one playbook for a tool with AI, from the tool's real actions. Saved as a draft.
export async function generatePlaybookFor(session: Session, toolkitKey: string, goal?: string): Promise<string> {
  requirePlatformAdmin(session);
  const key = integrationKeyFor(toolkitFor(toolkitKey));
  const [toolkit, tools] = await Promise.all([getToolkit(toolkitFor(key)).catch(() => null), toolsForToolkit(key)]);
  if (!tools.some((t) => t.integration === key)) throw new HttpError(409, `No actions are available for ${toolkit?.name ?? key} yet`);
  const db = adminDb();
  const { data: existing } = await db.from("playbooks").select("title").contains("toolkits", [key]);
  const draft = await generatePlaybook({
    tool: { key, name: toolkit?.name ?? key, description: toolkit?.description ?? "" },
    goal: goal?.trim() || undefined,
    availableTools: tools.map((t) => ({ key: t.key, label: t.label, description: t.description, access: t.access })),
    existingTitles: (existing ?? []).map((e) => e.title),
    onUsage: (u) => recordUsage(session.org.id, u),
  });
  if (!draft.agent.tools.length) throw new HttpError(422, "The draft used none of the tool's actions. Try again, or give it a goal.");
  const snapshots = draft.agent.tools.map((t) => snapshotOf(getTool(t))).filter((s): s is ToolSnapshot => Boolean(s));
  const { data, error } = await db
    .from("playbooks")
    .insert({
      slug: `${slugify(draft.title) || key}-${Math.random().toString(36).slice(2, 7)}`,
      title: draft.title,
      summary: draft.summary,
      department: draft.department,
      toolkits: [...new Set([key, ...draft.agent.tools.map((t) => getTool(t)?.integration).filter((i): i is string => Boolean(i) && i !== "knowledge")])],
      trigger: draft.trigger,
      steps: draft.steps as never,
      agent: draft.agent as never,
      tool_snapshots: snapshots as never,
      estimated_minutes_per_occurrence: draft.estimatedMinutesPerOccurrence,
      status: "draft",
      created_by: session.user.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`playbook: ${error?.message}`);
  await audit(session, { action: "playbook.generated", input: { toolkit: key, goal: goal ?? null }, output: { id: data.id } });
  return data.id;
}

// The popular tools that have no playbook yet, for a batch run.
export async function toolkitsWithoutPlaybooks(): Promise<string[]> {
  const { data } = await adminDb().from("playbooks").select("toolkits");
  const covered = new Set((data ?? []).flatMap((r) => r.toolkits));
  return POPULAR_TOOLKITS.map((t) => integrationKeyFor(t)).filter((k) => !covered.has(k));
}

export async function listPlaybooks(opts: { status?: "published" } = {}): Promise<PlaybookRow[]> {
  let q = adminDb().from("playbooks").select("*").order("department").order("title");
  if (opts.status) q = q.eq("status", opts.status);
  const { data } = await q;
  return (data ?? []).map(asRow);
}

export async function getPlaybook(id: string, opts: { publishedOnly?: boolean } = {}): Promise<PlaybookRow> {
  let q = adminDb().from("playbooks").select("*").eq("id", id);
  if (opts.publishedOnly) q = q.eq("status", "published");
  const { data } = await q.maybeSingle();
  if (!data) throw new HttpError(404, "Playbook not found");
  return asRow(data);
}

// What an administrator may change when reviewing a draft.
export type PlaybookEdit = {
  title: string;
  summary: string;
  department: string;
  trigger: string;
  steps: string[];
  estimatedMinutes: number | null;
  objective: string;
  rules: string[];
  escalations: string[];
  tools: string[];
  autonomyLevel: number;
};

export async function updatePlaybook(session: Session, id: string, edit: PlaybookEdit) {
  requirePlatformAdmin(session);
  const current = await getPlaybook(id);
  if (edit.title.trim().length < 3) throw new HttpError(400, "Give the playbook a title");
  if (edit.steps.filter(Boolean).length < 2) throw new HttpError(400, "A playbook needs at least two steps");
  if (!edit.tools.length) throw new HttpError(400, "Give the agent at least one tool");
  if (!(DEPARTMENTS as readonly string[]).includes(edit.department)) throw new HttpError(400, "Pick a department");
  // The tools stay within what the playbook's tools offer (or already had).
  registerSnapshots(current.tool_snapshots);
  const offered = new Set([...(await Promise.all(current.toolkits.map(toolsForToolkit))).flat().map((t) => t.key), ...current.agent.tools]);
  const unknown = edit.tools.filter((t) => !offered.has(t));
  if (unknown.length) throw new HttpError(400, `Unknown tool ${unknown[0]}`);
  const oldSteps = new Map(current.steps.map((s) => [s.title, s]));
  const agent: PlaybookAgent = {
    ...current.agent,
    name: edit.title.trim(),
    autonomyLevel: Math.min(4, Math.max(2, Math.round(edit.autonomyLevel))),
    tools: edit.tools,
    instructions: {
      ...current.agent.instructions,
      objective: edit.objective.trim() || current.agent.instructions.objective,
      rules: edit.rules.filter(Boolean),
      escalationConditions: edit.escalations.filter(Boolean),
    },
  };
  const { error } = await adminDb()
    .from("playbooks")
    .update({
      title: edit.title.trim(),
      summary: edit.summary.trim(),
      department: edit.department,
      trigger: edit.trigger.trim() || null,
      steps: edit.steps.filter(Boolean).map((t) => oldSteps.get(t) ?? { title: t }) as never,
      estimated_minutes_per_occurrence: edit.estimatedMinutes,
      agent: agent as never,
      tool_snapshots: edit.tools.map((t) => snapshotOf(getTool(t))).filter(Boolean) as never,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await audit(session, { action: "playbook.updated", input: { id } });
}

export async function setPlaybookStatus(session: Session, id: string, status: "draft" | "published") {
  requirePlatformAdmin(session);
  const { error } = await adminDb().from("playbooks").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(session, { action: `playbook.${status}`, input: { id } });
}

export async function deletePlaybook(session: Session, id: string) {
  requirePlatformAdmin(session);
  const { error } = await adminDb().from("playbooks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await audit(session, { action: "playbook.deleted", input: { id } });
}

// Starts a workspace on a published playbook: the process (with the workspace's own volume and
// time) and an automation idea whose agent is the playbook's. Building the agent then goes
// through the usual gates: connected tools, compliance owner and policy numbers where needed,
// and a test before it can go live.
export async function startFromPlaybook(session: Session, id: string, input: { occurrencesPerMonth: number; minutesPerOccurrence: number | null }): Promise<string> {
  const p = await getPlaybook(id, { publishedOnly: true });
  const names = await toolkitInfo(p.toolkits);
  const minutes = input.minutesPerOccurrence ?? p.estimated_minutes_per_occurrence ?? null;
  if (!(input.occurrencesPerMonth > 0)) throw new HttpError(400, "Say roughly how often this happens each month");
  if (!minutes || minutes <= 0) throw new HttpError(400, "Say roughly how many minutes it takes each time");
  const db = adminDb();
  const [processId] = await saveDiscoveredProcesses(
    session,
    [
      {
        title: p.title,
        description: p.summary,
        department: (DEPARTMENTS as readonly string[]).includes(p.department) ? (p.department as (typeof DEPARTMENTS)[number]) : "Other",
        trigger: p.trigger ?? undefined,
        frequency: "ad_hoc",
        estimatedOccurrencesPerMonth: input.occurrencesPerMonth,
        estimatedMinutesPerOccurrence: minutes,
        systems: p.toolkits.map((k) => names.get(k)?.name ?? k),
        roles: [],
        steps: p.steps,
        inputs: [],
        outputs: [],
        decisionPoints: [],
        exceptions: [],
        currentAutonomyLevel: 1,
        potentialAutonomyLevel: Math.min(5, p.agent.autonomyLevel + 1),
        businessValue: 3,
        automationDifficulty: 2,
        riskLevel: sensitiveAreas(`${p.title} ${p.summary}`).length ? 3 : 2,
        missingInformation: [],
        confidence: 1,
      },
    ],
    "manual",
  );
  let pid = processId;
  if (!pid) {
    // A process with this name already exists: start from it instead of adding a duplicate.
    const { data } = await db.from("processes").select("id").eq("organization_id", session.org.id).ilike("title", p.title).neq("status", "archived").limit(1).maybeSingle();
    if (!data) throw new HttpError(409, "Could not add the process");
    pid = data.id;
  } else {
    // The steps come from a reviewed playbook and the numbers from the person, so it is
    // confirmed and approved as added.
    await confirmProcess(session, pid);
    await setProcessStatus(session, pid, "reviewed").catch(() => undefined);
  }
  // The share of today's time the agent takes over grows with how much it does on its own.
  const share = p.agent.autonomyLevel >= 4 ? 0.75 : p.agent.autonomyLevel === 3 ? 0.6 : 0.4;
  const hours = Math.round(((input.occurrencesPerMonth * minutes) / 60) * share * 10) / 10;
  registerSnapshots(p.tool_snapshots);
  const writes = p.agent.tools.map((t) => getTool(t)).filter((t): t is ToolDefinition => t?.access === "write");
  const { data: o, error } = await db
    .from("automation_opportunities")
    .insert({
      organization_id: session.org.id,
      process_id: pid,
      title: p.title,
      description: p.summary,
      proposed_agent: { name: p.agent.name, description: p.agent.description } as never,
      current_autonomy_level: 1,
      target_autonomy_level: p.agent.autonomyLevel,
      business_value_score: 3,
      automation_difficulty_score: 2,
      risk_score: sensitiveAreas(`${p.title} ${p.summary}`).length ? 3 : 2,
      estimated_hours_saved_monthly: hours,
      estimated_cost_saved_monthly: Math.round(hours * session.org.defaultHourlyCost),
      estimated_build_complexity: "Low",
      required_integrations: p.toolkits.map((k) => names.get(k)?.name ?? k),
      required_tools: p.agent.tools,
      future_state_steps: futureSteps(p) as never,
      human_involvement: p.agent.instructions.escalationConditions,
      required_approvals: p.agent.autonomyLevel <= 3 ? writes.map((t) => t.label) : writes.filter((t) => t.riskTags.length).map((t) => t.label),
      rationale: `From the ready-made playbook "${p.title}".`,
      recommended_next_step: "Build and test the agent",
      playbook_id: p.id,
      created_by: session.user.id,
    })
    .select("id")
    .single();
  if (error || !o) throw new Error(`opportunity: ${error?.message}`);
  await audit(session, { action: "playbook.used", input: { playbook: p.id }, output: { process: pid, opportunity: o.id } });
  await activity(session, { actionType: "playbook_used", title: `Started from the playbook ${p.title}`, processId: pid });
  return o.id;
}

// How the work runs with the agent: its steps, with a person approving where the level asks for it.
function futureSteps(p: PlaybookRow): Array<{ title: string; actor: "agent" | "human"; approval?: boolean }> {
  const steps = p.agent.instructions.steps.length ? p.agent.instructions.steps : p.steps.map((s) => s.title);
  const out: Array<{ title: string; actor: "agent" | "human"; approval?: boolean }> = steps.map((title) => ({ title, actor: "agent" }));
  if (p.agent.autonomyLevel <= 3 && out.length) out[out.length - 1] = { ...out[out.length - 1]!, approval: true };
  if (p.agent.autonomyLevel === 2) out.push({ title: "A person reviews and sends the draft", actor: "human" });
  return out;
}

// The agent a playbook describes, as the configuration to build (used instead of drafting one).
export function playbookAgentConfig(p: PlaybookRow): AgentConfig {
  registerSnapshots(p.tool_snapshots);
  const level = Math.min(4, Math.max(2, p.agent.autonomyLevel)) as AgentConfig["autonomyLevel"];
  return AgentConfigSchema.parse({
    name: p.agent.name,
    description: p.agent.description,
    autonomyLevel: level,
    instructions: p.agent.instructions,
    trigger: { type: "manual" },
    tools: p.agent.tools,
    policy: policyForTools(p.agent.tools, level),
    successCriteria: p.agent.successCriteria,
    modelConfig: { modelClass: "AGENT_MODEL" },
  });
}

// Names and logos for the tools playbooks use: the workspace catalog first, then the directory.
export async function toolkitInfo(keys: string[]): Promise<Map<string, { name: string; logo: string | null }>> {
  const unique = [...new Set(keys)];
  const out = new Map<string, { name: string; logo: string | null }>();
  if (!unique.length) return out;
  const { data } = await adminDb().from("integrations").select("key, name, logo").in("key", unique);
  for (const r of data ?? []) out.set(r.key, { name: r.name, logo: r.logo ?? null });
  await Promise.all(
    unique
      .filter((k) => !out.has(k))
      .map(async (k) => {
        const t = await getToolkit(toolkitFor(k)).catch(() => null);
        out.set(k, { name: t?.name ?? k.charAt(0).toUpperCase() + k.slice(1).replaceAll("_", " "), logo: t?.logo ?? null });
      }),
  );
  return out;
}

// The tools an administrator can draft playbooks for: the built-in ones and the most used
// directory tools, each with whether it has a playbook already.
export async function studioToolkits(): Promise<Array<{ key: string; name: string; logo: string | null; playbooks: number }>> {
  const keys = [...new Set([...BUILTIN_INTEGRATIONS, ...POPULAR_TOOLKITS.map((t) => integrationKeyFor(t))])].filter((k) => k !== "knowledge");
  const [info, { data }] = await Promise.all([toolkitInfo(keys), adminDb().from("playbooks").select("toolkits")]);
  const counts = new Map<string, number>();
  for (const r of data ?? []) for (const k of r.toolkits) counts.set(k, (counts.get(k) ?? 0) + 1);
  return keys.map((k) => ({ key: k, name: info.get(k)?.name ?? k, logo: info.get(k)?.logo ?? null, playbooks: counts.get(k) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name));
}

// The actions an administrator can give a playbook's agent: its tools' actions plus the ones
// it already has.
export async function offeredTools(p: PlaybookRow): Promise<Array<{ key: string; label: string; integration: string; access: "read" | "write" }>> {
  registerSnapshots(p.tool_snapshots);
  const all = [
    ...(await Promise.all(p.toolkits.map((k) => toolsForToolkit(k).catch(() => [] as ToolDefinition[])))).flat(),
    ...p.agent.tools.map((t) => getTool(t)).filter((t): t is ToolDefinition => Boolean(t)),
  ];
  const seen = new Map<string, { key: string; label: string; integration: string; access: "read" | "write" }>();
  for (const t of all) if (!seen.has(t.key)) seen.set(t.key, { key: t.key, label: t.label, integration: t.integration, access: t.access });
  return [...seen.values()];
}

// Drafts an administrator has under way, and the ones that failed in the last hour.
export async function draftJobs(userId: string): Promise<Array<{ id: string; toolkit: string; goal: string | null; status: string; error: string | null }>> {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { data } = await adminDb()
    .from("background_jobs")
    .select("id, input, status, error, created_at")
    .eq("user_id", userId)
    .eq("kind", "playbook")
    .in("status", ["queued", "running", "failed"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []).map((j) => {
    const input = (j.input ?? {}) as { toolkit?: string; goal?: string };
    return { id: j.id, toolkit: input.toolkit ?? "", goal: input.goal ?? null, status: j.status, error: j.error };
  });
}

export type GalleryPlaybook = {
  id: string;
  title: string;
  summary: string;
  department: string;
  tools: Array<{ key: string; name: string; logo: string | null; connected: boolean }>;
  steps: number;
  minutes: number | null;
  ready: boolean;
};

// Published playbooks for a workspace: the ones whose tools are all connected first.
export async function playbookGallery(connected: string[]): Promise<GalleryPlaybook[]> {
  const rows = await listPlaybooks({ status: "published" });
  const info = await toolkitInfo(rows.flatMap((p) => p.toolkits));
  const have = new Set(connected);
  return rows
    .map((p) => {
      const tools = p.toolkits.map((k) => ({ key: k, name: info.get(k)?.name ?? k, logo: info.get(k)?.logo ?? null, connected: have.has(k) }));
      return {
        id: p.id,
        title: p.title,
        summary: p.summary,
        department: p.department,
        tools,
        steps: p.steps.length,
        minutes: p.estimated_minutes_per_occurrence,
        ready: tools.every((t) => t.connected),
      };
    })
    .sort((a, b) => Number(b.ready) - Number(a.ready) || b.tools.filter((t) => t.connected).length - a.tools.filter((t) => t.connected).length || a.title.localeCompare(b.title));
}
