import "server-only";
import { adminDb } from "@/lib/session";

// Runs that can no longer finish on their own are closed when a page reads them, so a
// run never shows "Queued" or "In progress" next to a newer finished one. Queued this long
// means no worker took it; running this long is past the worker's own time limit.
const QUEUED_LIMIT_MS = 10 * 60_000;
const RUNNING_LIMIT_MS = 30 * 60_000;

export async function reconcileStuckRuns(organizationId: string) {
  const db = adminDb();
  const now = Date.now();
  const finishedAt = new Date(now).toISOString();
  await Promise.all([
    db
      .from("agent_runs")
      .update({
        status: "failed",
        outcome: "failed",
        success: false,
        summary: "Never started",
        error: "This run was never picked up, so nothing happened. Start it again from the agent.",
        error_retryable: false,
        finished_at: finishedAt,
      })
      .eq("organization_id", organizationId)
      .eq("status", "queued")
      .lt("queued_at", new Date(now - QUEUED_LIMIT_MS).toISOString()),
    db
      .from("agent_runs")
      .update({
        status: "failed",
        outcome: "failed",
        success: false,
        summary: "Stopped reporting progress",
        error: "This run stopped reporting progress and was closed. Start it again from the agent.",
        error_retryable: false,
        finished_at: finishedAt,
      })
      .eq("organization_id", organizationId)
      .eq("status", "running")
      .lt("started_at", new Date(now - RUNNING_LIMIT_MS).toISOString()),
  ]);
}
