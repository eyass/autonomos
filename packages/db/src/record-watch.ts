import { recentRecords, recordInput, type RecentRecords, type ScanContext, type SystemInventory } from "@autonomos/integrations";
import type { DbClient } from "./index";
import { sandboxStore } from "./run-store";
import { createRun, RunNotAllowedError } from "./services";

// "New record" triggers: every few minutes, look at the newest records of each watched system
// and start one run per record the agent has not seen. The first look only marks what is
// already there as seen, so an agent never works through a backlog it was not built for.

const READ = 25;
// Runs one agent may start per check; the rest wait for the next check.
const PER_CHECK = 10;

export async function connectionContext(db: DbClient, organizationId: string, integration: string): Promise<ScanContext | null> {
  const { data: c } = await db
    .from("integration_connections")
    .select("provider, external_account_id, inventory")
    .eq("organization_id", organizationId)
    .eq("integration_key", integration)
    .eq("status", "connected")
    .maybeSingle();
  if (!c) return null;
  return {
    organizationId,
    connection: { integration, provider: c.provider as "sandbox" | "composio", externalAccountId: c.external_account_id },
    sandbox: sandboxStore(db, organizationId),
    inventory: (c.inventory as SystemInventory | null) ?? null,
  };
}

export async function recentRecordsFor(db: DbClient, organizationId: string, integration: string, max = 20): Promise<RecentRecords & { connected: boolean }> {
  const ctx = await connectionContext(db, organizationId, integration);
  if (!ctx) return { records: [], source: null, connected: false, unsupported: `${integration} is not connected.` };
  return { ...(await recentRecords(integration, ctx, max)), connected: true };
}

export type WatchResult = { agentId: string; integration: string; started: string[]; seeded: number; error?: string };

export async function checkRecordWatches(db: DbClient): Promise<WatchResult[]> {
  const { data: agents, error } = await db.from("agents").select("id, organization_id, agent_versions!agents_active_version_fk(trigger_config)").eq("status", "active");
  if (error) throw new Error(`record watches: ${error.message}`);
  const watching = (agents ?? []).flatMap((a) => {
    const t = (a.agent_versions as unknown as { trigger_config: { type: string; integration?: string } } | null)?.trigger_config;
    return t?.type === "new_record" && t.integration ? [{ id: a.id, organizationId: a.organization_id, integration: t.integration }] : [];
  });
  // An agent that stopped listening forgets its watch, so it starts fresh when it listens again.
  const { data: watches } = await db.from("agent_record_watches").select("agent_id, integration, started_at");
  const listening = new Set(watching.map((w) => `${w.id}:${w.integration}`));
  const stale = (watches ?? []).filter((w) => !listening.has(`${w.agent_id}:${w.integration}`)).map((w) => w.agent_id);
  if (stale.length) {
    await db.from("agent_seen_records").delete().in("agent_id", stale);
    await db.from("agent_record_watches").delete().in("agent_id", stale);
  }
  const results: WatchResult[] = [];
  for (const w of watching) {
    const existing = (watches ?? []).find((x) => x.agent_id === w.id && x.integration === w.integration);
    try {
      results.push(await checkOne(db, w, existing?.started_at ?? null));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db
        .from("agent_record_watches")
        .update({ checked_at: new Date().toISOString(), last_error: message.slice(0, 500) })
        .eq("agent_id", w.id);
      results.push({ agentId: w.id, integration: w.integration, started: [], seeded: 0, error: message });
    }
  }
  return results;
}

async function checkOne(db: DbClient, w: { id: string; organizationId: string; integration: string }, startedAt: string | null): Promise<WatchResult> {
  const result: WatchResult = { agentId: w.id, integration: w.integration, started: [], seeded: 0 };
  const read = await recentRecordsFor(db, w.organizationId, w.integration, READ);
  if (!read.connected) throw new Error(`${w.integration} is not connected`);
  const now = new Date().toISOString();
  if (!startedAt) {
    // First look: what is there now is the baseline, not work to do.
    await db
      .from("agent_record_watches")
      .upsert({ agent_id: w.id, organization_id: w.organizationId, integration: w.integration, started_at: now, checked_at: now, last_error: null });
    if (read.records.length) {
      await db.from("agent_seen_records").upsert(
        read.records.map((r) => ({ agent_id: w.id, organization_id: w.organizationId, record_id: r.id })),
        { onConflict: "agent_id,record_id", ignoreDuplicates: true },
      );
    }
    result.seeded = read.records.length;
    return result;
  }
  const ids = read.records.map((r) => r.id);
  const { data: seen } = ids.length ? await db.from("agent_seen_records").select("record_id").eq("agent_id", w.id).in("record_id", ids) : { data: [] };
  const seenIds = new Set((seen ?? []).map((s) => s.record_id));
  // Oldest first, and never one dated before the watch began.
  const fresh = read.records.filter((r) => !seenIds.has(r.id) && (!r.date || Date.parse(r.date) >= Date.parse(startedAt))).reverse();
  let lastError: string | null = read.unsupported && !read.records.length ? read.unsupported : null;
  for (const r of fresh.slice(0, PER_CHECK)) {
    // Claiming the record first means two overlapping checks can never both start it.
    const { data: claimed } = await db
      .from("agent_seen_records")
      .upsert({ agent_id: w.id, organization_id: w.organizationId, record_id: r.id }, { onConflict: "agent_id,record_id", ignoreDuplicates: true })
      .select("record_id");
    if (!claimed?.length) continue;
    try {
      const { runId } = await createRun(db, {
        organizationId: w.organizationId,
        agentId: w.id,
        mode: "production",
        trigger: { type: "new_record", integration: w.integration, record_id: r.id },
        input: recordInput(w.integration, r),
      });
      await db.from("agent_seen_records").update({ agent_run_id: runId }).eq("agent_id", w.id).eq("record_id", r.id);
      result.started.push(runId);
    } catch (e) {
      // Not allowed to run now (paused, plan allowance used up): the record is skipped, not queued.
      if (e instanceof RunNotAllowedError) {
        lastError = e.message;
        break;
      }
      throw e;
    }
  }
  await db.from("agent_record_watches").update({ checked_at: now, last_error: lastError }).eq("agent_id", w.id);
  return result;
}
