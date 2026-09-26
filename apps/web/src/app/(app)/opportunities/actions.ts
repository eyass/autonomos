"use server";
import { z } from "zod";
import { runAction } from "@/lib/actions";
import { adminDb, requireSessionOrThrow } from "@/lib/session";
import { pauseAgent } from "@/server/agents";
import { setOpportunityStatus, type OpportunityStatus } from "@/server/opportunities";

const Status = z.enum(["suggested", "reviewing", "approved", "building", "live", "rejected", "archived"]);

// Rejecting an opportunity, or putting it on hold, also pauses a live agent built from it:
// the opportunity is the reason the agent exists.
export async function setOpportunityStatusAction(id: string, status: OpportunityStatus) {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    const next = Status.parse(status);
    if (next === "rejected" || next === "reviewing") {
      const { data: agents } = await adminDb().from("agents").select("id, status").eq("organization_id", session.org.id).eq("opportunity_id", id).eq("status", "active");
      for (const a of agents ?? []) await pauseAgent(session, a.id);
    }
    await setOpportunityStatus(session, id, next);
  });
}
