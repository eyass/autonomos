"use server";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
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
