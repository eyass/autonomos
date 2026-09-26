"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { requireSessionOrThrow } from "@/lib/session";
import { refreshWebsiteProfile } from "@/server/company-profile";
import {
  archiveDepartment,
  CompanySettingsSchema,
  inviteMember,
  ProfileSchema,
  removeMember,
  revokeInvite,
  setAgentsPaused,
  setMemberApproval,
  setMemberRole,
  updateCompany,
  updateProfile,
  upsertDepartment,
} from "@/server/org";
import { createApiKey, revokeApiKey, setApprovalLimit } from "@/server/platform";

export async function updateCompanyAction(_: unknown, form: FormData) {
  const result = await runAction(async () =>
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
  // The name shows in the sidebar and workspace menu on every page.
  if (result.ok) revalidatePath("/(app)", "layout");
  return result;
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

export async function setPausedAction(paused: boolean, hours?: number | null) {
  return runAction(async () => {
    const h =
      hours === undefined || hours === null
        ? null
        : z
            .number()
            .positive()
            .max(24 * 14)
            .parse(hours);
    return setAgentsPaused(await requireSessionOrThrow(), paused, h ? new Date(Date.now() + h * 3_600_000).toISOString() : null);
  });
}

export async function revokeInviteAction(email: string) {
  return runAction(async () => revokeInvite(await requireSessionOrThrow(), email));
}

export async function setMemberRoleAction(userId: string, role: "admin" | "member") {
  return runAction(async () => setMemberRole(await requireSessionOrThrow(), userId, z.enum(["admin", "member"]).parse(role)));
}

export async function updateProfileAction(_: unknown, form: FormData) {
  return runAction(async () =>
    updateProfile(
      await requireSessionOrThrow(),
      ProfileSchema.parse({
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
        approvals: form.get("approvals") === "on",
        failures: form.get("failures") === "on",
        weeklySummary: form.get("weeklySummary") === "on",
      }),
    ),
  );
}

export async function refreshProfileAction() {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    rateLimit(`website:${session.user.id}`, 6, 60_000);
    const analysis = await refreshWebsiteProfile(session);
    return { pages: analysis.pagesRead.length, tools: analysis.detectedTools.map((t) => t.name) };
  });
}

export async function createApiKeyAction(_: unknown, form: FormData) {
  return runAction(async () => {
    const created = await createApiKey(await requireSessionOrThrow(), String(form.get("name") ?? ""));
    revalidatePath("/settings");
    return created;
  });
}

export async function revokeApiKeyAction(id: string) {
  return runAction(async () => revokeApiKey(await requireSessionOrThrow(), id));
}

export async function setApprovalLimitAction(_: unknown, form: FormData) {
  return runAction(async () => {
    const raw = String(form.get("limit") ?? "").trim();
    await setApprovalLimit(await requireSessionOrThrow(), String(form.get("userId")), raw === "" ? null : Number(raw));
    revalidatePath("/settings");
  });
}
