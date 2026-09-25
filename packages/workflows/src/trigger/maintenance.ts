import { logger, schedules, tasks } from "@trigger.dev/sdk";
import { createServiceClient, createRun, snapshotMetrics } from "@autonomos/db";
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
    const { runId } = await createRun(db, {
      organizationId: agent.organization_id,
      agentId: agent.id,
      mode: "production",
      trigger: { type: "schedule", scheduleId: payload.scheduleId, timestamp: payload.timestamp.toISOString() },
      input: { scheduled_for: payload.timestamp.toISOString() },
    });
    await tasks.trigger<typeof agentRunTask>("agent-run", { runId }, { idempotencyKey: `run-${runId}` });
  },
});
