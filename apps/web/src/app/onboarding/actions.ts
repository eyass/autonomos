"use server";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { getUser, HttpError, requireSessionOrThrow } from "@/lib/session";
import { analyseWebsite, saveWebsiteProfile, WebsiteAnalysisSchema } from "@/server/company-profile";
import { AboutSchema, completeOnboarding, CreateOrgSchema, createOrganization, saveAbout } from "@/server/org";

export async function analyseWebsiteAction(website: string) {
  return runAction(async () => {
    const user = await getUser();
    if (!user) throw new HttpError(401, "Sign in first");
    rateLimit(`website:${user.id}`, 6, 60_000);
    return analyseWebsite({ website, email: user.email ?? "" });
  });
}

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
  redirect(result.data.complete ? "/onboarding/connect" : "/onboarding/about");
}

export async function saveAboutAction(_: unknown, form: FormData) {
  const result = await runAction(async () => saveAbout(await requireSessionOrThrow(), AboutSchema.parse({ summary: form.get("summary"), areas: form.getAll("areas") })));
  if (!result.ok) return result;
  redirect("/onboarding/connect");
}

export async function finishOnboardingAction() {
  const result = await runAction(async () => completeOnboarding(await requireSessionOrThrow()));
  if (!result.ok) return result;
  redirect(result.data > 0 ? `/processes?status=draft&drafted=${result.data}` : "/discover?welcome=1");
}
