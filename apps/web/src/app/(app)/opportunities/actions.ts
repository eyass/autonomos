"use server";
import { runAction } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
import { setOpportunityStatus } from "@/server/opportunities";

export async function setOpportunityStatusAction(id: string, status: "reviewing" | "approved" | "rejected" | "archived" | "suggested") {
  return runAction(async () => setOpportunityStatus(await requireSessionOrThrow(), id, status));
}
