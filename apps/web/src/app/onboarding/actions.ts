"use server";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
import { AboutSchema, completeOnboarding, CreateOrgSchema, createOrganization, saveAbout } from "@/server/org";

export async function createCompanyAction(_: unknown, form: FormData) {
  const result = await runAction(() =>
    createOrganization(
      CreateOrgSchema.parse({
        name: form.get("name"),
        website: form.get("website") ?? "",
        industry: form.get("industry") ?? "",
        employeeCount: form.get("employeeCount") ?? "",
        country: form.get("country") ?? "",
        description: form.get("description") ?? "",
      }),
    ),
  );
  if (!result.ok) return result;
  redirect("/onboarding/about");
}

export async function saveAboutAction(_: unknown, form: FormData) {
  const result = await runAction(async () => saveAbout(await requireSessionOrThrow(), AboutSchema.parse({ summary: form.get("summary"), areas: form.getAll("areas") })));
  if (!result.ok) return result;
  redirect("/onboarding/connect");
}

export async function finishOnboardingAction() {
  const result = await runAction(async () => completeOnboarding(await requireSessionOrThrow()));
  if (!result.ok) return result;
  redirect("/discover?welcome=1");
}
