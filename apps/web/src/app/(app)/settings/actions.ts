"use server";
import { z } from "zod";
import { runAction } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { requireSessionOrThrow } from "@/lib/session";
import { refreshWebsiteProfile } from "@/server/company-profile";
import { archiveDepartment, CompanySettingsSchema, inviteMember, removeMember, setAgentsPaused, setMemberApproval, updateCompany, upsertDepartment } from "@/server/org";

export async function updateCompanyAction(_: unknown, form: FormData) {
  return runAction(async () =>
    updateCompany(
      await requireSessionOrThrow(),
      CompanySettingsSchema.parse({
        name: form.get("name"),
        industry: form.get("industry") ?? "",
        website: form.get("website") ?? "",
        employeeCount: form.get("employeeCount") ?? "",
        summary: form.get("summary") ?? undefined,
        defaultHourlyCost: Number(form.get("defaultHourlyCost")),
      }),
    ),
  );
}

export async function saveDepartmentAction(_: unknown, form: FormData) {
  return runAction(async () => {
    const cost = String(form.get("hourlyLabourCost") ?? "").trim();
    await upsertDepartment(await requireSessionOrThrow(), {
      id: (form.get("id") as string) || undefined,
      name: z.string().trim().min(1).parse(form.get("name")),
      hourlyLabourCost: cost ? z.number().positive().parse(Number(cost)) : null,
    });
  });
}

export async function archiveDepartmentAction(id: string) {
  return runAction(async () => archiveDepartment(await requireSessionOrThrow(), id));
}

export async function inviteAction(_: unknown, form: FormData) {
  return runAction(async () => inviteMember(await requireSessionOrThrow(), String(form.get("email") ?? ""), form.get("role") === "admin" ? "admin" : "member"));
}

export async function removeMemberAction(userId: string) {
  return runAction(async () => removeMember(await requireSessionOrThrow(), userId));
}

export async function setApprovalAction(userId: string, canApprove: boolean) {
  return runAction(async () => setMemberApproval(await requireSessionOrThrow(), userId, canApprove));
}

export async function setPausedAction(paused: boolean) {
  return runAction(async () => setAgentsPaused(await requireSessionOrThrow(), paused));
}

export async function refreshProfileAction() {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    rateLimit(`website:${session.user.id}`, 6, 60_000);
    const analysis = await refreshWebsiteProfile(session);
    return { pages: analysis.pagesRead.length, tools: analysis.detectedTools.map((t) => t.name) };
  });
}
