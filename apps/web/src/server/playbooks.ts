import "server-only";
import { choosePlaybookTools, generatePlaybook } from "@autonomos/ai";
import { AgentConfigSchema, DEPARTMENTS, PlaybookStepSchema, type AgentConfig, type Department, type PlaybookDraft, type PlaybookStep } from "@autonomos/schemas";
import { policyFieldsFor, policyForTools, sensitiveAreas } from "@autonomos/agents";
import { CAPABILITIES, capabilitiesOf, capabilityInfo, getTool, getToolkit, integrationKeyFor, isCapability, toolkitFor, type Capability, type ToolDefinition } from "@autonomos/integrations";
import { audit, activity, recordUsage } from "@/lib/audit";
import { adminDb, HttpError, type Session } from "@/lib/session";
import { SANDBOX_INTEGRATIONS } from "@/server/integrations";
import { confirmProcess, saveDiscoveredProcesses, setComplianceOwner, setPolicyThresholds, setProcessStatus } from "@/server/processes";
import { availableTools, registerWorkspaceTools } from "@/server/tool-catalog";

// Ready-made playbooks: templates the site's administrators draft with AI, review and publish.
// A playbook never names a product. Each step names the kind of system it needs (a help desk,
// a payment system); a workspace connects its own tool to each, and AI picks that tool's
// actions for the step. Only site administrators (PLATFORM_ADMIN_EMAILS) write playbooks.

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
  capabilities: Capability[];
  trigger: string | null;
  steps: PlaybookStep[];
  agent: PlaybookAgent;
  estimated_minutes_per_occurrence: number | null;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
};

const asRow = (r: Record<string, unknown>) =>
  ({
    ...r,
    steps: ((r.steps as unknown[]) ?? []).map((s) => PlaybookStepSchema.parse(s)),
    capabilities: ((r.capabilities as string[]) ?? []).filter(isCapability),
    estimated_minutes_per_occurrence: r.estimated_minutes_per_occurrence === null ? null : Number(r.estimated_minutes_per_occurrence),
  }) as unknown as PlaybookRow;

// The capabilities a playbook's steps need, in step order.
export const neededCapabilities = (steps: PlaybookStep[]): Capability[] => [...new Set(steps.map((s) => s.capability).filter((c): c is Capability => Boolean(c) && isCapability(c!)))];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

// Drafts one playbook with AI, for a department and/or a goal. Saved as a draft.
export async function generatePlaybookFor(session: Session, input: { department?: string; goal?: string }): Promise<string> {
  requirePlatformAdmin(session);
  const department = input.department && (DEPARTMENTS as readonly string[]).includes(input.department) ? input.department : undefined;
  const db = adminDb();
  const { data: existing } = await db.from("playbooks").select("title");
  const draft = await generatePlaybook({
    department,
    goal: input.goal?.trim() || undefined,
    capabilities: CAPABILITIES.map((c) => ({ key: c.key, label: c.label, hint: c.hint })),
    existingTitles: (existing ?? []).map((e) => e.title),
    onUsage: (u) => recordUsage(session.org.id, u),
  });
  const capabilities = neededCapabilities(draft.steps);
  if (!capabilities.length) throw new HttpError(422, "The draft did not say which systems it works in. Try again, or give it a goal.");
  const { data, error } = await db
    .from("playbooks")
    .insert({
      slug: `${slugify(draft.title) || "playbook"}-${Math.random().toString(36).slice(2, 7)}`,
      title: draft.title,
      summary: draft.summary,
      department: draft.department,
      capabilities,
      trigger: draft.trigger,
      steps: draft.steps as never,
      agent: draft.agent as never,
      estimated_minutes_per_occurrence: draft.estimatedMinutesPerOccurrence,
      status: "draft",
      created_by: session.user.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`playbook: ${error?.message}`);
  await audit(session, { action: "playbook.generated", input: { department: department ?? null, goal: input.goal ?? null }, output: { id: data.id } });
  return data.id;
}

// A first library: common recurring work across departments, drafted in one go.
export const STARTER_PLAYBOOKS: Array<{ department: Department; goal: string }> = [
  { department: "Customer Support", goal: "Handle refund requests against the refund policy" },
  { department: "Customer Support", goal: "Answer where-is-my-order questions with the order status" },
  { department: "Finance", goal: "Chase unpaid invoices after the due date" },
  { department: "Finance", goal: "Match incoming payments to open invoices" },
  { department: "Sales", goal: "Qualify new inbound leads and route them to the right owner" },
  { department: "Sales", goal: "Follow up on deals with no activity for a week" },
  { department: "Operations", goal: "Flag orders that cannot ship because of low stock" },
  { department: "Marketing", goal: "Welcome new subscribers and tag them by interest" },
  { department: "HR", goal: "Prepare the first week for a new employee" },
  { department: "HR", goal: "Handle leave requests against the leave balance" },
];

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
  steps: PlaybookStep[];
  estimatedMinutes: number | null;
  objective: string;
  rules: string[];
  escalations: string[];
  autonomyLevel: number;
};

// Steps as stored: a capability always has read or write access, a judgement step has none.
export function tidySteps(steps: PlaybookStep[]): PlaybookStep[] {
  return steps
    .map((s) => ({ ...s, title: s.title.trim(), detail: (s.detail ?? "").trim() }))
    .filter((s) => s.title)
    .map((s) => {
      const capability = s.capability && isCapability(s.capability) ? s.capability : null;
      return { ...s, capability, access: capability ? (s.access === "none" ? "read" : s.access) : "none" };
    });
}

export async function updatePlaybook(session: Session, id: string, edit: PlaybookEdit) {
  requirePlatformAdmin(session);
  const current = await getPlaybook(id);
  const steps = tidySteps(edit.steps);
  if (edit.title.trim().length < 3) throw new HttpError(400, "Give the playbook a title");
  if (steps.length < 2) throw new HttpError(400, "A playbook needs at least two steps");
  if (!neededCapabilities(steps).length) throw new HttpError(400, "At least one step needs a system to work in");
  if (!(DEPARTMENTS as readonly string[]).includes(edit.department)) throw new HttpError(400, "Pick a department");
  const agent: PlaybookAgent = {
    ...current.agent,
    name: edit.title.trim(),
    autonomyLevel: Math.min(4, Math.max(2, Math.round(edit.autonomyLevel))),
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
      steps: steps as never,
      capabilities: neededCapabilities(steps),
      estimated_minutes_per_occurrence: edit.estimatedMinutes,
      agent: agent as never,
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

// ---------------------------------------------------------------------------
// In a workspace: which connected tool fills each capability
// ---------------------------------------------------------------------------

export type WorkspaceTool = { key: string; name: string; logo: string | null; capabilities: Capability[] };

export async function workspaceTools(session: Session): Promise<WorkspaceTool[]> {
  const { data } = await adminDb().from("integration_connections").select("integration_key, integrations(name, logo, category)").eq("organization_id", session.org.id).eq("status", "connected");
  return (data ?? []).map((c) => {
    const i = c.integrations as unknown as { name: string; logo: string | null; category: string | null } | null;
    return { key: c.integration_key, name: i?.name ?? c.integration_key, logo: i?.logo ?? null, capabilities: capabilitiesOf(c.integration_key, i?.category) };
  });
}

export type Suggestion = { slug: string; key: string; name: string; logo: string | null; sandbox: boolean };

// Names and logos for tools a workspace has not connected: the catalog first, then the directory.
async function suggestionsFor(capability: Capability, connected: Set<string>): Promise<Suggestion[]> {
  const info = capabilityInfo(capability)!;
  const slugs = info.toolkits.filter((t) => !connected.has(integrationKeyFor(t))).slice(0, 4);
  const keys = slugs.map((s) => integrationKeyFor(s));
  const { data } = await adminDb().from("integrations").select("key, name, logo").in("key", keys);
  const known = new Map((data ?? []).map((r) => [r.key, r]));
  return Promise.all(
    slugs.map(async (slug) => {
      const key = integrationKeyFor(slug);
      const row = known.get(key);
      const t = row ? null : await getToolkit(toolkitFor(key)).catch(() => null);
      return { slug, key, name: row?.name ?? t?.name ?? key.charAt(0).toUpperCase() + key.slice(1), logo: row?.logo ?? t?.logo ?? null, sandbox: SANDBOX_INTEGRATIONS.includes(key) };
    }),
  );
}

export type Slot = {
  capability: Capability;
  label: string;
  hint: string;
  group: string;
  // Connected tools that fill it, most likely first.
  options: Array<{ key: string; name: string; logo: string | null }>;
  suggestions: Suggestion[];
};

// Each capability a playbook needs, with the workspace's tools that can fill it.
export async function playbookSlots(session: Session, p: PlaybookRow, tools?: WorkspaceTool[]): Promise<Slot[]> {
  const mine = tools ?? (await workspaceTools(session));
  const connected = new Set(mine.map((t) => t.key));
  return Promise.all(
    p.capabilities.map(async (capability) => {
      const info = capabilityInfo(capability)!;
      const options = mine.filter((t) => t.capabilities.includes(capability)).map(({ key, name, logo }) => ({ key, name, logo }));
      return { capability, label: info.label, hint: info.hint, group: info.group, options, suggestions: options.length ? [] : await suggestionsFor(capability, connected) };
    }),
  );
}

export type GalleryPlaybook = {
  id: string;
  title: string;
  summary: string;
  department: string;
  capabilities: Array<{ key: Capability; label: string; covered: boolean }>;
  steps: number;
  minutes: number | null;
  ready: boolean;
};

// Published playbooks for a workspace: the ones its connected tools already cover first.
export async function playbookGallery(session: Session): Promise<GalleryPlaybook[]> {
  const [rows, mine] = await Promise.all([listPlaybooks({ status: "published" }), workspaceTools(session)]);
  const covered = new Set(mine.flatMap((t) => t.capabilities));
  return rows
    .map((p) => {
      const capabilities = p.capabilities.map((c) => ({ key: c, label: capabilityInfo(c)!.label, covered: covered.has(c) }));
      return {
        id: p.id,
        title: p.title,
        summary: p.summary,
        department: p.department,
        capabilities,
        steps: p.steps.length,
        minutes: p.estimated_minutes_per_occurrence,
        ready: capabilities.every((c) => c.covered),
      };
    })
    .sort((a, b) => Number(b.ready) - Number(a.ready) || b.capabilities.filter((c) => c.covered).length - a.capabilities.filter((c) => c.covered).length || a.title.localeCompare(b.title));
}

// The agent's actions for each step, from the tool the workspace connected for it.
async function toolsForSteps(session: Session, p: PlaybookRow, bindings: Partial<Record<Capability, string>>): Promise<string[][]> {
  const bound = [...new Set(Object.values(bindings).filter((k): k is string => Boolean(k)))];
  const all = await availableTools(session, bound);
  const summary = (t: ToolDefinition) => ({ key: t.key, label: t.label, description: t.description, access: t.access, integration: t.integration });
  const toolsByStep = p.steps.map((s) => (s.capability && bindings[s.capability as Capability] ? all.filter((t) => t.integration === bindings[s.capability as Capability]).map(summary) : []));
  return choosePlaybookTools({ steps: p.steps, toolsByStep, onUsage: (u) => recordUsage(session.org.id, u) });
}

// The regulated areas a playbook touches (money, personal data...), which need a named person
// signing off on compliance before its agent is built.
export const playbookPolicyFields = (p: Pick<PlaybookRow, "title" | "summary" | "steps">) => policyFieldsFor(playbookSensitive(p));
export const playbookSensitive = (p: Pick<PlaybookRow, "title" | "summary" | "steps">) => sensitiveAreas(`${p.title} ${p.summary} ${p.steps.map((s) => `${s.title} ${s.detail}`).join(" ")}`);

// Starts a workspace on a published playbook with its own tools: the process (with its own
// volume and time) and an automation idea whose agent is the playbook's, using the actions
// of the tools connected for each step. Building it then goes through the usual gates.
export async function startFromPlaybook(
  session: Session,
  id: string,
  input: { occurrencesPerMonth: number; minutesPerOccurrence: number | null; bindings: Record<string, string>; complianceOwner?: string; policy?: Record<string, string> },
): Promise<string> {
  const p = await getPlaybook(id, { publishedOnly: true });
  const minutes = input.minutesPerOccurrence ?? p.estimated_minutes_per_occurrence ?? null;
  if (!(input.occurrencesPerMonth > 0)) throw new HttpError(400, "Say roughly how often this happens each month");
  if (!minutes || minutes <= 0) throw new HttpError(400, "Say roughly how many minutes it takes each time");
  const sensitive = playbookSensitive(p);
  const owner = input.complianceOwner?.trim() ?? "";
  if (sensitive.length && owner.length < 2) throw new HttpError(409, `This work involves ${sensitive.join(" and ")}. Name who signs off on compliance.`);
  const unset = policyFieldsFor(sensitive).filter((f) => !(input.policy?.[f.key] ?? "").trim());
  if (unset.length) throw new HttpError(409, `Set your policy first: ${unset.map((f) => f.label.toLowerCase()).join("; ")}.`);
  const mine = await workspaceTools(session);
  const byKey = new Map(mine.map((t) => [t.key, t]));
  const bindings: Partial<Record<Capability, string>> = {};
  for (const c of p.capabilities) {
    const key = input.bindings[c];
    const label = capabilityInfo(c)!.label.toLowerCase();
    if (!key) throw new HttpError(409, `Connect a ${label} tool first`);
    if (!byKey.has(key)) throw new HttpError(409, `That ${label} tool is not connected`);
    bindings[c] = key;
  }
  const stepTools = await toolsForSteps(session, p, bindings);
  const missing = p.steps.findIndex((s, i) => s.access !== "none" && !stepTools[i]!.length);
  if (missing >= 0) {
    const s = p.steps[missing]!;
    throw new HttpError(
      409,
      `${byKey.get(bindings[s.capability as Capability]!)?.name ?? "That tool"} has no action to ${s.access === "read" ? "look up" : "do"} "${s.title}". Pick another tool for this step.`,
    );
  }
  const tools = [...new Set([...stepTools.flat(), "knowledge.search_documents"])];
  const nameOf = (c: string | null) => (c ? (byKey.get(bindings[c as Capability] ?? "")?.name ?? undefined) : undefined);
  const systems = [...new Set(Object.values(bindings).map((k) => byKey.get(k!)?.name ?? k!))];
  const risky = sensitive.length > 0;
  const db = adminDb();
  const [processId] = await saveDiscoveredProcesses(
    session,
    [
      {
        title: p.title,
        description: p.summary,
        department: (DEPARTMENTS as readonly string[]).includes(p.department) ? (p.department as Department) : "Other",
        trigger: p.trigger ?? undefined,
        frequency: "ad_hoc",
        estimatedOccurrencesPerMonth: input.occurrencesPerMonth,
        estimatedMinutesPerOccurrence: minutes,
        systems,
        roles: [],
        steps: p.steps.map((s) => ({ title: s.title, description: s.detail || undefined, system: nameOf(s.capability), requiresJudgement: s.access === "none" || undefined })),
        inputs: [],
        outputs: [],
        decisionPoints: [],
        exceptions: [],
        currentAutonomyLevel: 1,
        potentialAutonomyLevel: Math.min(5, p.agent.autonomyLevel + 1),
        businessValue: 3,
        automationDifficulty: 2,
        riskLevel: risky ? 3 : 2,
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
  if (sensitive.length) {
    await setComplianceOwner(session, pid, owner);
    await setPolicyThresholds(session, pid, input.policy ?? {});
  }
  // The share of today's time the agent takes over grows with how much it does on its own.
  const share = p.agent.autonomyLevel >= 4 ? 0.75 : p.agent.autonomyLevel === 3 ? 0.6 : 0.4;
  const hours = Math.round(((input.occurrencesPerMonth * minutes) / 60) * share * 10) / 10;
  const writes = tools.map((t) => getTool(t)).filter((t): t is ToolDefinition => t?.access === "write");
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
      risk_score: risky ? 3 : 2,
      estimated_hours_saved_monthly: hours,
      estimated_cost_saved_monthly: Math.round(hours * session.org.defaultHourlyCost),
      estimated_build_complexity: "Low",
      required_integrations: systems,
      required_tools: tools,
      future_state_steps: futureSteps(p, nameOf) as never,
      human_involvement: p.agent.instructions.escalationConditions,
      required_approvals: p.agent.autonomyLevel <= 3 ? writes.map((t) => t.label) : writes.filter((t) => t.riskTags.length).map((t) => t.label),
      rationale: `From the ready-made playbook "${p.title}".`,
      recommended_next_step: "Build and test the agent",
      playbook_id: p.id,
      playbook_bindings: bindings as never,
      created_by: session.user.id,
    })
    .select("id")
    .single();
  if (error || !o) throw new Error(`opportunity: ${error?.message}`);
  await audit(session, { action: "playbook.used", input: { playbook: p.id, bindings }, output: { process: pid, opportunity: o.id } });
  await activity(session, { actionType: "playbook_used", title: `Started from the playbook ${p.title}`, processId: pid });
  return o.id;
}

// How the work runs with the agent: each step in the connected tool, with a person approving
// changes where the level asks for it.
function futureSteps(p: PlaybookRow, nameOf: (c: string | null) => string | undefined): Array<{ title: string; actor: "agent" | "human"; approval?: boolean }> {
  const out: Array<{ title: string; actor: "agent" | "human"; approval?: boolean }> = p.steps.map((s) => ({
    title: nameOf(s.capability) ? `${s.title} (${nameOf(s.capability)})` : s.title,
    actor: "agent",
    ...(s.access === "write" && p.agent.autonomyLevel <= 3 ? { approval: true } : {}),
  }));
  if (p.agent.autonomyLevel === 2) out.push({ title: "A person reviews and sends the draft", actor: "human" });
  return out;
}

// The agent a playbook describes, with the actions chosen for the workspace's tools.
export async function playbookAgentConfig(session: Session, p: PlaybookRow, tools: string[]): Promise<AgentConfig> {
  // Registers the Composio actions of the workspace's tools, so policy and the version snapshot see them.
  await Promise.all([registerWorkspaceTools(session.org.id), availableTools(session)]);
  const level = Math.min(4, Math.max(2, p.agent.autonomyLevel)) as AgentConfig["autonomyLevel"];
  return AgentConfigSchema.parse({
    name: p.agent.name,
    description: p.agent.description,
    autonomyLevel: level,
    instructions: p.agent.instructions,
    trigger: { type: "manual" },
    tools,
    policy: policyForTools(tools, level),
    successCriteria: p.agent.successCriteria,
    modelConfig: { modelClass: "AGENT_MODEL" },
  });
}

// Drafts an administrator has under way, and the ones that failed in the last hour.
export async function draftJobs(userId: string): Promise<Array<{ id: string; label: string; status: string; error: string | null }>> {
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
    const input = (j.input ?? {}) as { department?: string; goal?: string };
    return { id: j.id, label: input.goal ?? (input.department ? `${input.department} work` : "the most valuable common work"), status: j.status, error: j.error };
  });
}
