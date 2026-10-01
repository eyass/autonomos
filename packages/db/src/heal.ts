import { connectedAccountStatus, inventorySystem, type SystemInventory } from "@autonomos/integrations";
import type { DbClient, TablesUpdate } from "./index";
import { sendNotification } from "./notify";
import { sandboxStore } from "./run-store";

// Self-healing sweeps, run every few minutes by the maintenance task and on page reads. Each one
// repairs a state that would otherwise wait for a person: a run nobody picked up or that went
// quiet is started again once, and closed with a plain reason only if that fails too; a run whose
// approval was decided but never resumed is resumed; a schedule that drifted from its agent is put
// back; a system inventory that failed or was cut off is taken again.

export type Enqueue = (runId: string, idempotencyKey: string) => Promise<void>;

const QUEUED_LIMIT_MS = 10 * 60_000;
// No sign of life for this long: the worker stopped (its own limit is 10 minutes per attempt).
const SILENT_LIMIT_MS = 20 * 60_000;
const APPROVAL_SETTLE_MS = 2 * 60_000;
const MAX_RECOVERIES = 1;

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export type HealReport = { restarted: string[]; closed: string[]; resumed: string[] };

export async function healRuns(db: DbClient, enqueue: Enqueue, organizationId?: string): Promise<HealReport> {
  const report: HealReport = { restarted: [], closed: [], resumed: [] };
  const scope = <Q extends { eq: (c: string, v: string) => Q }>(q: Q) => (organizationId ? q.eq("organization_id", organizationId) : q);

  // Queued too long, or running with no sign of life: start again once, then close.
  const { data: queued } = await scope(
    db.from("agent_runs").select("id, organization_id, mode, recovery_attempts, agents(name)").eq("status", "queued").lt("queued_at", ago(QUEUED_LIMIT_MS)).limit(100),
  );
  const { data: running } = await scope(
    db
      .from("agent_runs")
      .select("id, organization_id, mode, recovery_attempts, heartbeat_at, started_at, agents(name)")
      .eq("status", "running")
      .lt("started_at", ago(SILENT_LIMIT_MS))
      .limit(100),
  );
  const silent = (running ?? []).filter((r) => !r.heartbeat_at || r.heartbeat_at < ago(SILENT_LIMIT_MS));
  for (const r of [...(queued ?? []).map((x) => ({ ...x, kind: "queued" as const })), ...silent.map((x) => ({ ...x, kind: "running" as const }))]) {
    const name = (r.agents as unknown as { name: string } | null)?.name ?? "An agent";
    if (r.recovery_attempts < MAX_RECOVERIES) {
      const attempt = r.recovery_attempts + 1;
      // Claim the restart first, so two sweeps never restart the same run twice.
      const { data: claimed } = await db
        .from("agent_runs")
        .update({ recovery_attempts: attempt, heartbeat_at: new Date().toISOString(), ...(r.kind === "queued" ? { queued_at: new Date().toISOString() } : {}) })
        .eq("id", r.id)
        .eq("recovery_attempts", r.recovery_attempts)
        .select("id");
      if (!claimed?.length) continue;
      try {
        await enqueue(r.id, `heal-${r.id}-${attempt}`);
        await audit(db, r.organization_id, r.id, "run.restarted", r.kind === "queued" ? "No worker picked it up; started again." : "It stopped reporting progress; started again.");
        report.restarted.push(r.id);
        continue;
      } catch (e) {
        console.error("heal: restart failed", r.id, e);
      }
    }
    const { data: closed } = await db
      .from("agent_runs")
      .update({
        status: "failed",
        outcome: "failed",
        success: false,
        summary: r.kind === "queued" ? "Never started" : "Stopped reporting progress",
        error:
          r.kind === "queued"
            ? "This run was never picked up, also after AutonomOS started it again, so nothing happened. Start it again from the agent."
            : "This run stopped reporting progress, also after AutonomOS started it again, and was closed. Start it again from the agent.",
        error_retryable: false,
        finished_at: new Date().toISOString(),
      })
      .eq("id", r.id)
      .eq("status", r.kind)
      .select("id");
    if (!closed?.length) continue;
    report.closed.push(r.id);
    if (r.mode === "production") {
      const link = `/activity/${r.id}`;
      await sendNotification(db, r.organization_id, {
        kind: "agent_failed",
        title: `${name} failed`,
        body: "The run stopped before it finished, also after AutonomOS started it again. Start it again from the agent.",
        link,
        key: `agent_failed:${link}`,
      }).catch((e) => console.error("notification failed", e));
    }
  }

  // Waiting for an approval that has been decided: the resume was lost, so resume it.
  const { data: waiting } = await scope(db.from("agent_runs").select("id, organization_id, recovery_attempts").eq("status", "waiting_for_approval").limit(200));
  for (const r of waiting ?? []) {
    const { data: approvals } = await db.from("approval_requests").select("id, status, resolved_at").eq("agent_run_id", r.id);
    if (!approvals?.length || approvals.some((a) => a.status === "pending")) continue;
    const last =
      approvals
        .map((a) => a.resolved_at ?? "")
        .sort()
        .at(-1) ?? "";
    if (!last || last > ago(APPROVAL_SETTLE_MS)) continue;
    const attempt = r.recovery_attempts + 1;
    if (attempt > MAX_RECOVERIES + 1) continue;
    const { data: claimed } = await db.from("agent_runs").update({ recovery_attempts: attempt }).eq("id", r.id).eq("recovery_attempts", r.recovery_attempts).select("id");
    if (!claimed?.length) continue;
    try {
      await enqueue(r.id, `heal-resume-${r.id}-${attempt}`);
      await audit(db, r.organization_id, r.id, "run.resumed", "The approval was decided but the run had not continued; resumed.");
      report.resumed.push(r.id);
    } catch (e) {
      console.error("heal: resume failed", r.id, e);
    }
  }
  return report;
}

async function audit(db: DbClient, organizationId: string, runId: string, action: string, why: string) {
  await db
    .from("audit_events")
    .insert({ organization_id: organizationId, actor_type: "system", action, agent_run_id: runId, input: { reason: why } as never, result: "success" })
    .then(({ error }) => error && console.error("audit failed", error.message));
}

export type ScheduleOps = { create: (agentId: string, cron: string, timezone: string) => Promise<string>; deactivate: (scheduleId: string) => Promise<void> };

// Agents whose schedule drifted from their trigger: a live scheduled agent without a schedule
// gets one; an agent that is not live, or no longer scheduled, loses its schedule.
export async function healSchedules(db: DbClient, ops: ScheduleOps): Promise<{ created: string[]; removed: string[] }> {
  const out = { created: [] as string[], removed: [] as string[] };
  const { data: agents } = await db.from("agents").select("id, status, trigger_schedule_id, agent_versions!agents_active_version_fk(trigger_config)").limit(2000);
  for (const a of agents ?? []) {
    const t = (a.agent_versions as unknown as { trigger_config: { type: string; cron?: string; timezone?: string } } | null)?.trigger_config;
    const wantsSchedule = a.status === "active" && t?.type === "schedule" && Boolean(t.cron);
    try {
      if (wantsSchedule && !a.trigger_schedule_id) {
        const id = await ops.create(a.id, t!.cron!, t!.timezone ?? "UTC");
        await db.from("agents").update({ trigger_schedule_id: id }).eq("id", a.id);
        out.created.push(a.id);
      } else if (!wantsSchedule && a.trigger_schedule_id) {
        await ops.deactivate(a.trigger_schedule_id);
        await db.from("agents").update({ trigger_schedule_id: null }).eq("id", a.id);
        out.removed.push(a.id);
      }
    } catch (e) {
      console.error("heal: schedule", a.id, e);
    }
  }
  return out;
}

// Inventories that failed or were cut off are taken again, at most once an hour per system.
const INVENTORY_TIMEOUT_MS = 4 * 60_000;
export const INVENTORY_STALE_MS = 6 * 60_000;
const INVENTORY_RETRY_MS = 60 * 60_000;

export async function takeInventory(db: DbClient, organizationId: string, key: string, timeoutMs = INVENTORY_TIMEOUT_MS): Promise<SystemInventory | null> {
  const { data: c } = await db
    .from("integration_connections")
    .select("provider, external_account_id, status")
    .eq("organization_id", organizationId)
    .eq("integration_key", key)
    .maybeSingle();
  if (!c || c.status !== "connected") return null;
  const save = (fields: TablesUpdate<"integration_connections">) =>
    db.from("integration_connections").update(fields).eq("organization_id", organizationId).eq("integration_key", key);
  await save({ inventory_status: "running", inventory_error: null, inventoried_at: new Date().toISOString() });
  try {
    const inventory = await Promise.race([
      inventorySystem(key, {
        organizationId,
        connection: { integration: key, provider: c.provider as "sandbox" | "composio", externalAccountId: c.external_account_id },
        sandbox: sandboxStore(db, organizationId),
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Listing took too long")), timeoutMs)),
    ]);
    await save({ inventory: inventory as never, inventory_status: "ready", inventoried_at: inventory.takenAt, inventory_error: null });
    return inventory;
  } catch (e) {
    console.error("inventory failed", key, e);
    await save({ inventory_status: "failed", inventory_error: e instanceof Error ? e.message.slice(0, 300) : "failed" });
    return null;
  }
}

export async function healInventories(db: DbClient, max = 5): Promise<string[]> {
  const { data } = await db
    .from("integration_connections")
    .select("organization_id, integration_key, inventory_status, inventoried_at")
    .eq("status", "connected")
    .in("inventory_status", ["failed", "running"])
    .limit(50);
  const due = (data ?? []).filter((c) =>
    c.inventory_status === "running" ? !c.inventoried_at || c.inventoried_at < ago(INVENTORY_STALE_MS) : !c.inventoried_at || c.inventoried_at < ago(INVENTORY_RETRY_MS),
  );
  const healed: string[] = [];
  for (const c of due.slice(0, max)) {
    if (await takeInventory(db, c.organization_id, c.integration_key)) healed.push(`${c.organization_id}:${c.integration_key}`);
  }
  return healed;
}

// Connections whose sign-in stopped working are marked as needing a reconnect straight away, with
// one notice to the workspace a day, instead of failing quietly inside runs and scans. When the
// account works again (Composio renewed it, or someone reconnected), it is marked connected again.
export async function healConnections(
  db: DbClient,
  statusOf: (externalAccountId: string) => Promise<string | null> = connectedAccountStatus,
): Promise<{ broken: string[]; restored: string[] }> {
  const out = { broken: [] as string[], restored: [] as string[] };
  const { data } = await db
    .from("integration_connections")
    .select("organization_id, integration_key, external_account_id, status, last_error, integrations(name)")
    .eq("provider", "composio")
    .in("status", ["connected", "error"])
    .not("external_account_id", "is", null)
    .limit(500);
  for (const c of data ?? []) {
    const status = await statusOf(c.external_account_id!);
    if (status === null) continue;
    const name = (c.integrations as unknown as { name: string } | null)?.name ?? c.integration_key;
    const key = `${c.organization_id}:${c.integration_key}`;
    if (status === "ACTIVE" && c.status === "error") {
      await db.from("integration_connections").update({ status: "connected", last_error: null }).eq("organization_id", c.organization_id).eq("integration_key", c.integration_key);
      out.restored.push(key);
    } else if (status !== "ACTIVE" && c.status === "connected") {
      const reason =
        status === "DELETED" ? `The ${name} connection no longer exists at the sign-in provider.` : `The ${name} sign-in ${status === "EXPIRED" ? "expired" : "stopped working"}.`;
      await db
        .from("integration_connections")
        .update({ status: "error", last_error: `${reason} Reconnect it to continue.` })
        .eq("organization_id", c.organization_id)
        .eq("integration_key", c.integration_key);
      await sendNotification(db, c.organization_id, {
        kind: "integration_error",
        title: `Reconnect ${name}`,
        body: `${reason} Agents that use it are on hold until it is reconnected, which takes one click.`,
        link: "/integrations",
        key: `reconnect:${c.integration_key}:${new Date().toISOString().slice(0, 10)}`,
      }).catch((e) => console.error("notification failed", e));
      out.broken.push(key);
    }
  }
  return out;
}
