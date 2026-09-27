"use server";
import { runAction } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
import { resolveApproval } from "@/server/approvals";

export async function approveAction(id: string, comment?: string) {
  return runAction(async () => resolveApproval(await requireSessionOrThrow(), id, { decision: "approve", comment }));
}

export async function rejectAction(id: string, comment?: string) {
  return runAction(async () => resolveApproval(await requireSessionOrThrow(), id, { decision: "reject", comment }));
}

export async function modifyAction(id: string, changes: Record<string, unknown>, comment?: string) {
  return runAction(async () => resolveApproval(await requireSessionOrThrow(), id, { decision: "modify", changes, comment }));
}

// A run an agent handed to a person: someone took care of it.
export async function markHandledAction(runId: string) {
  const { adminDb } = await import("@/lib/session");
  const { audit } = await import("@/lib/audit");
  const { revalidatePath } = await import("next/cache");
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    const { data } = await adminDb()
      .from("agent_runs")
      .update({ handled_at: new Date().toISOString(), handled_by: session.user.id })
      .eq("organization_id", session.org.id)
      .eq("id", String(runId))
      .eq("outcome", "escalated")
      .is("handled_at", null)
      .select("id")
      .maybeSingle();
    if (data) await audit(session, { action: "run.handoff_handled", input: { runId } });
    revalidatePath("/approvals");
  });
}
