"use server";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
import { generateOpportunitiesForProcess } from "@/server/opportunities";
import { createManualProcess, ManualProcessSchema, ProcessUpdateSchema, setProcessStatus, updateProcess } from "@/server/processes";

export async function createProcessAction(_: unknown, form: FormData) {
  const result = await runAction(async () =>
    createManualProcess(
      await requireSessionOrThrow(),
      ManualProcessSchema.parse({ title: form.get("title"), description: form.get("description"), department: form.get("department"), generate: form.get("generate") === "on" }),
    ),
  );
  if (!result.ok) return result;
  redirect(`/processes/${result.data}`);
}

export async function updateProcessAction(id: string, input: unknown) {
  return runAction(async () => updateProcess(await requireSessionOrThrow(), id, ProcessUpdateSchema.parse(input)));
}

export async function setProcessStatusAction(id: string, status: "reviewed" | "active" | "archived" | "draft") {
  return runAction(async () => setProcessStatus(await requireSessionOrThrow(), id, status));
}

// Approving a process is the moment to look for automation: do it straight away rather
// than waiting for a second click. If the analysis fails the process stays approved.
export async function approveProcessAction(id: string) {
  const result = await runAction(async () => {
    const session = await requireSessionOrThrow();
    await setProcessStatus(session, id, "reviewed");
    try {
      return await generateOpportunitiesForProcess(session, id);
    } catch (e) {
      console.error("opportunity generation after approval failed", e);
      return [];
    }
  });
  if (!result.ok) return result;
  if (!result.data.length) return { ok: true as const, data: undefined };
  redirect(result.data.length === 1 ? `/opportunities/${result.data[0]}?found=1` : `/opportunities?process=${id}`);
}

export async function generateOpportunitiesAction(processId: string) {
  const result = await runAction(async () => generateOpportunitiesForProcess(await requireSessionOrThrow(), processId));
  if (!result.ok) return result;
  redirect(result.data.length === 1 ? `/opportunities/${result.data[0]}` : `/opportunities?process=${processId}`);
}
