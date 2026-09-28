"use server";
import { z } from "zod";
import { runAction } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
import { startJob } from "@/server/jobs";
import { deletePlaybook, requirePlatformAdmin, setPlaybookStatus, toolkitsWithoutPlaybooks, updatePlaybook } from "@/server/playbooks";

const lines = z
  .string()
  .max(8000)
  .transform((s) =>
    s
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );

const Edit = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(1000),
  department: z.string().trim().min(1).max(60),
  trigger: z.string().trim().max(300),
  steps: lines,
  estimatedMinutes: z
    .string()
    .trim()
    .transform((s) => (s ? Number(s.replace(",", ".")) : null))
    .refine((n) => n === null || (Number.isFinite(n) && n > 0 && n < 100_000), "Minutes must be a number above zero"),
  objective: z.string().trim().max(2000),
  rules: lines,
  escalations: lines,
  tools: z.array(z.string().min(1)).max(40),
  autonomyLevel: z.coerce.number().int().min(2).max(4),
});

export async function savePlaybookAction(id: string, form: FormData) {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    const edit = Edit.parse({
      title: form.get("title") ?? "",
      summary: form.get("summary") ?? "",
      department: form.get("department") ?? "",
      trigger: form.get("trigger") ?? "",
      steps: form.get("steps") ?? "",
      estimatedMinutes: form.get("estimatedMinutes") ?? "",
      objective: form.get("objective") ?? "",
      rules: form.get("rules") ?? "",
      escalations: form.get("escalations") ?? "",
      tools: form.getAll("tools").map(String),
      autonomyLevel: form.get("autonomyLevel") ?? 3,
    });
    await updatePlaybook(session, id, edit);
  });
}

export async function setPlaybookStatusAction(id: string, status: "draft" | "published") {
  return runAction(async () => setPlaybookStatus(await requireSessionOrThrow(), id, z.enum(["draft", "published"]).parse(status)));
}

export async function deletePlaybookAction(id: string) {
  return runAction(async () => deletePlaybook(await requireSessionOrThrow(), id));
}

// Drafts one playbook for each popular tool that has none yet, a few at a time.
export async function draftMissingAction() {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    requirePlatformAdmin(session);
    const missing = (await toolkitsWithoutPlaybooks()).slice(0, 6);
    for (const toolkit of missing) await startJob({ userId: session.user.id, organizationId: session.org.id, kind: "playbook", subject: `${toolkit}:`, input: { toolkit } });
    return { started: missing.length };
  });
}
