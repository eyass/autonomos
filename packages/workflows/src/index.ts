import { configure, schedules, tasks } from "@trigger.dev/sdk";
import type { agentRunTask } from "./trigger/agent-run";

// Application-side helpers for enqueueing work on Trigger.dev. The durable runtime is
// required: without TRIGGER_SECRET_KEY these fail loudly rather than running inline.

export class TriggerNotConfiguredError extends Error {
  constructor() {
    super("Trigger.dev is not configured. Set TRIGGER_SECRET_KEY to run agents.");
    this.name = "TriggerNotConfiguredError";
  }
}

let configured = false;
function ensureConfigured() {
  const secretKey = process.env.TRIGGER_SECRET_KEY;
  if (!secretKey) throw new TriggerNotConfiguredError();
  if (!configured) {
    configure({ secretKey, baseURL: process.env.TRIGGER_API_URL });
    configured = true;
  }
}

export function triggerConfigured() {
  return Boolean(process.env.TRIGGER_SECRET_KEY);
}

// idempotencyKey distinguishes the initial start from each resume (one per approval decision).
export async function enqueueRun(runId: string, idempotencyKey = `run-${runId}`) {
  ensureConfigured();
  const handle = await tasks.trigger<typeof agentRunTask>("agent-run", { runId }, { idempotencyKey, tags: [`run_${runId}`] });
  return handle.id;
}

export async function upsertAgentSchedule(agentId: string, cron: string, timezone: string) {
  ensureConfigured();
  const schedule = await schedules.create({ task: "agent-schedule", cron, timezone, externalId: agentId, deduplicationKey: `agent-${agentId}` });
  return schedule.id;
}

export async function deactivateAgentSchedule(scheduleId: string) {
  ensureConfigured();
  await schedules.deactivate(scheduleId);
}
