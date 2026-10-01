"use server";
import { z } from "zod";
import { runAction } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
import { startJob } from "@/server/jobs";
import { deletePlaybook, listPlaybooks, requirePlatformAdmin, setPlaybookStatus, STARTER_PLAYBOOKS, updatePlaybook } from "@/server/playbooks";

const lines = z
  .string()
  .max(8000)
  .transform((s) =>
    s
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );

const Step = z.object({
  title: z.string().max(200),
  detail: z.string().max(500).default(""),
  capability: z.string().max(40).nullable(),
  access: z.enum(["read", "write", "none"]),
});

const Edit = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(1000),
  department: z.string().trim().min(1).max(60),
  industries: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .pipe(z.array(z.string().max(60)).max(20)),
  trigger: z.string().trim().max(300),
  steps: z.array(Step).max(12),
  estimatedMinutes: z
    .string()
    .trim()
    .transform((s) => (s ? Number(s.replace(",", ".")) : null))
    .refine((n) => n === null || (Number.isFinite(n) && n > 0 && n < 100_000), "Minutes must be a number above zero"),
  objective: z.string().trim().max(2000),
  rules: lines,
  escalations: lines,
  autonomyLevel: z.coerce.number().int().min(2).max(4),
});

export async function savePlaybookAction(id: string, raw: Record<string, unknown>) {
  return runAction(async () => updatePlaybook(await requireSessionOrThrow(), id, Edit.parse(raw)));
}

export async function setPlaybookStatusAction(id: string, status: "draft" | "published") {
  return runAction(async () => setPlaybookStatus(await requireSessionOrThrow(), id, z.enum(["draft", "published"]).parse(status)));
}

export async function deletePlaybookAction(id: string) {
  return runAction(async () => deletePlaybook(await requireSessionOrThrow(), id));
}

// Drafts the starter library: common recurring work across departments, one job each.
export async function draftStarterLibraryAction() {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    requirePlatformAdmin(session);
    if ((await listPlaybooks()).length) return { started: 0 };
    for (const s of STARTER_PLAYBOOKS) await startJob({ userId: session.user.id, organizationId: session.org.id, kind: "playbook", subject: `${s.department}:${s.goal}`, input: s });
    return { started: STARTER_PLAYBOOKS.length };
  });
}
