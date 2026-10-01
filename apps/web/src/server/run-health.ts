import "server-only";
import { healRuns } from "@autonomos/db";
import { enqueueRun } from "@autonomos/workflows";
import { adminDb } from "@/lib/session";

// Reading a page heals that workspace's runs right away, on top of the five-minute sweep: a run
// nobody picked up or that went quiet is started again once, and closed with a plain reason only
// if that fails too (see packages/db/src/heal.ts).
export async function reconcileStuckRuns(organizationId: string) {
  try {
    await healRuns(
      adminDb(),
      async (runId, key) => {
        await enqueueRun(runId, key);
      },
      organizationId,
    );
  } catch (e) {
    // Healing must never break the page that triggered it.
    console.error("heal runs failed", e);
  }
}
