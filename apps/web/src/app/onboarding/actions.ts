"use server";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
import { saveWebsiteProfile, WebsiteAnalysisSchema } from "@/server/company-profile";
import { AboutSchema, completeOnboarding, CreateOrgSchema, createOrganization, saveAbout } from "@/server/org";
import { onboardingPath } from "./steps";

export async function createCompanyAction(_: unknown, form: FormData) {
  const result = await runAction(async () => {
    const hourly = Number(form.get("hourlyCost"));
    const org = await createOrganization(
      CreateOrgSchema.parse({
        name: form.get("name"),
        website: form.get("website") ?? "",
        industry: form.get("industry") ?? "",
        employeeCount: form.get("employeeCount") ?? "",
        country: form.get("country") ?? "",
        description: form.get("summary") ?? "",
        summary: form.get("summary") ?? "",
        areas: form.getAll("areas"),
        currency: form.get("currency") || undefined,
        hourlyCost: Number.isFinite(hourly) && hourly > 0 ? hourly : undefined,
      }),
    );
    const raw = form.get("analysis");
    if (typeof raw === "string" && raw) {
      const analysis = WebsiteAnalysisSchema.safeParse(JSON.parse(raw));
      if (analysis.success) await saveWebsiteProfile(org.id, analysis.data);
    }
    return org;
  });
  if (!result.ok) return result;
  redirect(result.data.complete ? "/onboarding/knowledge" : "/onboarding/about");
}

export async function saveAboutAction(_: unknown, form: FormData) {
  const result = await runAction(async () => saveAbout(await requireSessionOrThrow(), AboutSchema.parse({ summary: form.get("summary"), areas: form.getAll("areas") })));
  if (!result.ok) return result;
  redirect(onboardingPath(result.data));
}

export async function finishKnowledgeAction() {
  const result = await runAction(async () => {
    const { completeKnowledgeStep } = await import("@/server/knowledge");
    await completeKnowledgeStep(await requireSessionOrThrow());
  });
  if (!result.ok) return result;
  redirect("/onboarding/connect");
}

export async function finishOnboardingAction() {
  const result = await runAction(async () => completeOnboarding(await requireSessionOrThrow()));
  if (!result.ok) return result;
  redirect("/onboarding/mapping");
}

export async function retryMappingAction() {
  const result = await runAction(async () => {
    const { startMapping } = await import("@/server/first-inventory");
    await startMapping(await requireSessionOrThrow());
  });
  if (!result.ok) return result;
  redirect("/onboarding/mapping");
}
