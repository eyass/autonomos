import "server-only";
import { proposeProcessesFromSystems, type SystemSample } from "@autonomos/ai";
import { sandboxStore } from "@autonomos/db";
import { describeScan, sandboxHistory, scanSystem, SCANNABLE, type SystemScan } from "@autonomos/integrations";
import { SystemProcessProposalSchema, type SystemProcessProposal } from "@autonomos/schemas";
import { activity, recordUsage, track } from "@/lib/audit";
import { adminDb, HttpError, type Session } from "@/lib/session";
import { companyContext, saveDiscoveredProcesses } from "@/server/processes";

// Discovery from connected systems, as a run the browser drives step by step so people see
// each system being read: start → scan each system → propose → accept.

export type RunSystem = {
  key: string;
  name: string;
  provider: string;
  state: "pending" | "done" | "skipped" | "failed";
  line?: string;
  sampled?: number;
  itemKind?: string;
  periodDays?: number | null;
};

export type DiscoveryRunView = {
  id: string;
  status: "scanning" | "proposing" | "ready" | "failed";
  systems: RunSystem[];
  summary: string | null;
  proposals: Array<SystemProcessProposal & { exists: boolean }>;
  accepted: string[];
  createdAt: string;
  // Less than a day old.
  recent: boolean;
  error: string | null;
};

async function connections(session: Session) {
  const { data } = await adminDb()
    .from("integration_connections")
    .select("integration_key, provider, external_account_id, integrations(name)")
    .eq("organization_id", session.org.id)
    .eq("status", "connected");
  return (data ?? []).map((c) => ({
    key: c.integration_key,
    name: (c.integrations as unknown as { name: string } | null)?.name ?? c.integration_key,
    provider: c.provider as "sandbox" | "composio",
    externalAccountId: c.external_account_id,
  }));
}

// Live accounts can always be read (dedicated or general reader); sandboxes only when they hold data.
const readable = (c: { key: string; provider: string }) => c.provider === "composio" || SCANNABLE.includes(c.key);

async function existingTitles(session: Session) {
  const { data } = await adminDb().from("processes").select("title").eq("organization_id", session.org.id).neq("status", "archived");
  return (data ?? []).map((p) => p.title);
}

function toView(row: Record<string, unknown>, existing: string[]): DiscoveryRunView {
  const known = new Set(existing.map((t) => t.trim().toLowerCase()));
  return {
    id: row.id as string,
    status: row.status as DiscoveryRunView["status"],
    systems: (row.systems as RunSystem[]) ?? [],
    summary: (row.summary as string | null) ?? null,
    proposals: ((row.proposals as SystemProcessProposal[]) ?? []).map((p) => ({ ...p, exists: known.has(p.title.trim().toLowerCase()) })),
    accepted: (row.accepted as string[]) ?? [],
    createdAt: row.created_at as string,
    recent: Date.now() - new Date(row.created_at as string).getTime() < 86_400_000,
    error: (row.error as string | null) ?? null,
  };
}

export async function latestDiscoveryRun(session: Session): Promise<DiscoveryRunView | null> {
  const { data } = await adminDb().from("discovery_runs").select("*").eq("organization_id", session.org.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toView(data, await existingTitles(session)) : null;
}

// Sandbox systems get a month of fictional history the first time they are read, so a
// sandbox workspace has something real to discover from.
async function ensureSandboxHistory(session: Session, key: string) {
  const store = sandboxStore(adminDb(), session.org.id);
  const history = sandboxHistory(key);
  if (!history.length) return;
  const existing = await store.list(key, history[0]!.kind);
  if (existing.some((r) => (r as { history?: boolean }).history || String(r.id).startsWith("hist_") || String(r.id).startsWith("msg_") || String(r.id).startsWith("slk_"))) return;
  for (const { kind, record } of history) await store.put(key, kind, record);
}

export async function startDiscoveryRun(session: Session): Promise<DiscoveryRunView> {
  const conns = await connections(session);
  if (!conns.length) throw new HttpError(409, "Connect at least one system first, then AutonomOS can read it.");
  const systems: RunSystem[] = conns.map((c) => ({
    key: c.key,
    name: c.name,
    provider: c.provider,
    state: readable(c) ? "pending" : "skipped",
    line: readable(c) ? undefined : "This sandbox has no data to read.",
  }));
  const { data, error } = await adminDb()
    .from("discovery_runs")
    .insert({ organization_id: session.org.id, created_by: session.user.id, systems: systems as never, samples: [] as never })
    .select("*")
    .single();
  if (error || !data) throw new Error(`discovery run: ${error?.message}`);
  await track(session, "process_discovery_started", { method: "integration", systems: conns.length });
  return toView(data, []);
}

async function loadRun(session: Session, runId: string) {
  const { data } = await adminDb().from("discovery_runs").select("*").eq("organization_id", session.org.id).eq("id", runId).maybeSingle();
  if (!data) throw new HttpError(404, "Discovery run not found");
  return data;
}

// Reads one system. Failures are recorded on that system and do not stop the run.
export async function scanRunSystem(session: Session, runId: string, key: string): Promise<RunSystem> {
  const run = await loadRun(session, runId);
  const systems = (run.systems as RunSystem[]) ?? [];
  const target = systems.find((s) => s.key === key);
  if (!target) throw new HttpError(404, "That system is not part of this run");
  if (target.state !== "pending") return target;
  const conn = (await connections(session)).find((c) => c.key === key);
  let updated: RunSystem;
  let sample: SystemSample | null = null;
  try {
    if (!conn) throw new Error("No longer connected");
    if (conn.provider === "sandbox") await ensureSandboxHistory(session, key);
    const scan: SystemScan = await scanSystem(key, {
      organizationId: session.org.id,
      connection: { integration: key, provider: conn.provider, externalAccountId: conn.externalAccountId },
      sandbox: sandboxStore(adminDb(), session.org.id),
    });
    updated = scan.unsupported
      ? { ...target, state: "skipped", line: scan.unsupported }
      : { ...target, state: "done", sampled: scan.sampled, itemKind: scan.itemKind, periodDays: scan.periodDays, line: describeScan(scan, conn.name) };
    if (!scan.unsupported && scan.sampled) sample = { system: conn.name, summary: describeScan(scan, conn.name), periodDays: scan.periodDays, items: scan.items.slice(0, 100) };
  } catch (e) {
    console.error("system scan failed", key, e);
    updated = { ...target, state: "failed", line: `Could not read ${target.name}: ${e instanceof Error ? e.message.slice(0, 160) : "unknown error"}` };
  }
  const nextSystems = systems.map((s) => (s.key === key ? updated : s));
  const samples = [...((run.samples as SystemSample[]) ?? []), ...(sample ? [sample] : [])];
  await adminDb()
    .from("discovery_runs")
    .update({ systems: nextSystems as never, samples: samples as never, updated_at: new Date().toISOString() })
    .eq("organization_id", session.org.id)
    .eq("id", runId);
  return updated;
}

export async function proposeFromRun(session: Session, runId: string): Promise<DiscoveryRunView> {
  const run = await loadRun(session, runId);
  if (run.status === "ready") return toView(run, await existingTitles(session));
  const samples = (run.samples as SystemSample[]) ?? [];
  const existing = await existingTitles(session);
  const db = adminDb();
  if (!samples.length) {
    const { data } = await db
      .from("discovery_runs")
      .update({ status: "ready", samples: null, summary: "There was nothing to read yet in the connected systems.", updated_at: new Date().toISOString() })
      .eq("id", runId)
      .select("*")
      .single();
    return toView(data!, existing);
  }
  await db.from("discovery_runs").update({ status: "proposing" }).eq("id", runId);
  try {
    const result = await proposeProcessesFromSystems({
      company: await companyContext(session),
      samples,
      existingProcesses: existing,
      onUsage: (u) => recordUsage(session.org.id, u),
    });
    // Samples were only needed for this step; the run keeps counts and proposals.
    const { data } = await db
      .from("discovery_runs")
      .update({ status: "ready", samples: null, summary: result.summary, proposals: result.processes as never, updated_at: new Date().toISOString() })
      .eq("id", runId)
      .select("*")
      .single();
    await activity(session, { actionType: "systems_read", title: `Read connected systems and proposed ${result.processes.length} process${result.processes.length === 1 ? "" : "es"}` });
    return toView(data!, existing);
  } catch (e) {
    await db
      .from("discovery_runs")
      .update({ status: "failed", samples: null, error: e instanceof Error ? e.message.slice(0, 300) : "failed" })
      .eq("id", runId);
    throw e;
  }
}

export async function acceptProposals(session: Session, runId: string, titles: string[]) {
  const run = await loadRun(session, runId);
  const proposals = ((run.proposals as SystemProcessProposal[]) ?? []).map((p) => SystemProcessProposalSchema.parse(p));
  const chosen = proposals.filter((p) => titles.includes(p.title));
  if (!chosen.length) throw new HttpError(400, "Pick at least one process");
  const ids = await saveDiscoveredProcesses(session, chosen, "integration");
  // Keep the evidence with each process, so the process page can say why it exists.
  const db = adminDb();
  const { data: saved } = await db.from("processes").select("id, title").eq("organization_id", session.org.id).in("id", ids);
  for (const row of saved ?? []) {
    const p = chosen.find((c) => c.title === row.title);
    if (p)
      await db
        .from("processes")
        .update({ evidence: p.evidence as never })
        .eq("organization_id", session.org.id)
        .eq("id", row.id);
  }
  await db
    .from("discovery_runs")
    .update({ accepted: [...new Set([...((run.accepted as string[]) ?? []), ...chosen.map((c) => c.title)])] as never })
    .eq("id", runId);
  return ids;
}

// Evidence lines for prompts elsewhere (opportunities, first inventory). Reads systems
// the same way, without storing anything.
export async function readConnectedSystems(session: Session): Promise<string[]> {
  const lines: string[] = [];
  for (const c of await connections(session)) {
    if (!readable(c)) {
      lines.push(`${c.name} is connected.`);
      continue;
    }
    try {
      if (c.provider === "sandbox") await ensureSandboxHistory(session, c.key);
      const scan = await scanSystem(c.key, {
        organizationId: session.org.id,
        connection: { integration: c.key, provider: c.provider, externalAccountId: c.externalAccountId },
        sandbox: sandboxStore(adminDb(), session.org.id),
      });
      lines.push(describeScan(scan, c.name));
    } catch (e) {
      console.error("read connected system failed", c.key, e);
      lines.push(`${c.name} is connected but could not be read.`);
    }
  }
  return lines;
}
