import { logger, schedules, tasks } from "@trigger.dev/sdk";
import { checkRecordWatches, createServiceClient, createRun, healConnections, healInventories, healRuns, healSchedules, RunNotAllowedError, snapshotMetrics } from "@autonomos/db";
import type { agentRunTask } from "./agent-run";

// Expire approvals that nobody resolved, and resume their runs so they close cleanly.
export const approvalExpiryTask = schedules.task({
  id: "approval-expiry",
  cron: "*/15 * * * *",
  run: async () => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("approval_requests")
      .update({ status: "expired", resolved_at: new Date().toISOString() })
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString())
      .select("id, organization_id, agent_run_id");
    if (error) throw new Error(error.message);
    for (const a of data ?? []) {
      await db.from("audit_events").insert({ organization_id: a.organization_id, actor_type: "system", action: "approval.expired", agent_run_id: a.agent_run_id, result: "expired" });
      await tasks.trigger<typeof agentRunTask>("agent-run", { runId: a.agent_run_id }, { idempotencyKey: `resume-${a.id}` });
    }
    logger.info("expired approvals", { count: data?.length ?? 0 });
  },
});

// Daily snapshot for the autonomy trend chart.
export const metricsSnapshotTask = schedules.task({
  id: "metrics-snapshot",
  cron: "15 2 * * *",
  run: async () => {
    const db = createServiceClient();
    const { data } = await db.from("organizations").select("id");
    for (const org of data ?? []) await snapshotMetrics(db, org.id);
  },
});

// Imperative schedules created per agent (trigger type "schedule"). externalId is the agent id.
export const agentScheduleTask = schedules.task({
  id: "agent-schedule",
  run: async (payload) => {
    if (!payload.externalId) return;
    const db = createServiceClient();
    const { data: agent } = await db.from("agents").select("id, organization_id, status").eq("id", payload.externalId).maybeSingle();
    if (!agent || agent.status !== "active") {
      logger.info("skipping schedule for inactive agent", { agentId: payload.externalId });
      return;
    }
    let runId: string;
    try {
      ({ runId } = await createRun(db, {
        organizationId: agent.organization_id,
        agentId: agent.id,
        mode: "production",
        trigger: { type: "schedule", scheduleId: payload.scheduleId, timestamp: payload.timestamp.toISOString() },
        input: { scheduled_for: payload.timestamp.toISOString() },
      }));
    } catch (e) {
      // Not allowed to run now (plan allowance used up, agents paused): skip this slot, no retry.
      if (e instanceof RunNotAllowedError) {
        logger.info("skipping scheduled run", { agentId: agent.id, reason: e.message });
        return;
      }
      throw e;
    }
    await tasks.trigger<typeof agentRunTask>("agent-run", { runId }, { idempotencyKey: `run-${runId}` });
  },
});

// "New record" triggers: start a run for each new ticket, email or other record in a watched system.
export const recordWatchTask = schedules.task({
  id: "record-watch",
  cron: "*/5 * * * *",
  run: async () => {
    const results = await checkRecordWatches(createServiceClient());
    for (const r of results) {
      for (const runId of r.started) await tasks.trigger<typeof agentRunTask>("agent-run", { runId }, { idempotencyKey: `run-${runId}` });
      if (r.error) logger.warn("record watch failed", { agentId: r.agentId, integration: r.integration, error: r.error });
    }
    logger.info("record watches checked", { agents: results.length, runs: results.reduce((n, r) => n + r.started.length, 0), seeded: results.reduce((n, r) => n + r.seeded, 0) });
  },
});

// Self-healing: runs nobody picked up or that went quiet are started again once, resumes lost
// after an approval are redone, schedules that drifted from their agent are put back, and failed
// system inventories are taken again. Each repair is in the audit log.
export const selfHealTask = schedules.task({
  id: "self-heal",
  cron: "*/5 * * * *",
  run: async () => {
    const db = createServiceClient();
    const runs = await healRuns(db, async (runId, idempotencyKey) => {
      await tasks.trigger<typeof agentRunTask>("agent-run", { runId }, { idempotencyKey });
    });
    const scheduled = await healSchedules(db, {
      create: async (agentId, cron, timezone) => (await schedules.create({ task: "agent-schedule", cron, timezone, externalId: agentId, deduplicationKey: `agent-${agentId}` })).id,
      deactivate: async (id) => {
        await schedules.deactivate(id);
      },
    });
    const inventories = await healInventories(db);
    logger.info("self-heal", { ...runs, schedules: scheduled, inventories });
  },
});

// Connections whose sign-in stopped working are found within the hour, not inside a failed run.
export const connectionHealthTask = schedules.task({
  id: "connection-health",
  cron: "17 * * * *",
  run: async () => {
    const result = await healConnections(createServiceClient());
    logger.info("connection health", result);
  },
});
