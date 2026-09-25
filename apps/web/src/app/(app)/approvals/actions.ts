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
