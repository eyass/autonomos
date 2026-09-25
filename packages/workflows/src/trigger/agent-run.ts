import { AbortTaskRunError, logger, task } from "@trigger.dev/sdk";
import { executeRun, markRunFailed, RetryableRunError } from "@autonomos/agents";
import { createServiceClient, SupabaseRunStore } from "@autonomos/db";

// Advances one agent run. Idempotent: the engine resumes from persisted state, so this
// task is re-triggered after every approval decision and is safe to retry.
export const agentRunTask = task({
  id: "agent-run",
  queue: { name: "agent-runs", concurrencyLimit: 20 },
  retry: { maxAttempts: 5, minTimeoutInMs: 2_000, maxTimeoutInMs: 60_000, factor: 2, randomize: true },
  maxDuration: 600,
  run: async (payload: { runId: string }) => {
    const store = new SupabaseRunStore(createServiceClient());
    try {
      const result = await executeRun(payload.runId, store);
      logger.info("agent run advanced", { runId: payload.runId, result });
      return result;
    } catch (error) {
      if (error instanceof RetryableRunError) throw error; // Trigger.dev retries with backoff.
      throw new AbortTaskRunError(error instanceof Error ? error.message : String(error));
    }
  },
  onFailure: async ({ payload, error }) => {
    await markRunFailed(payload.runId, new SupabaseRunStore(createServiceClient()), `Retries exhausted: ${error instanceof Error ? error.message : String(error)}`);
  },
});
