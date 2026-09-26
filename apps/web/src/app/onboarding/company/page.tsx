import { redirect } from "next/navigation";
import { getSession, getUser } from "@/lib/session";
import { suggestedWebsite } from "@/server/company-profile";
import { Steps } from "../steps";
import { CompanyForm } from "./form";

export const metadata = { title: "Your company" };

export default async function CompanyPage() {
  const session = await getSession();
  if (session) redirect(session.org.onboardingCompletedAt ? "/" : session.org.onboardingStep === "connect" ? "/onboarding/connect" : "/onboarding/about");
  const user = await getUser();
  return (
    <>
      <Steps current={0} />
      <h1 className="mb-1 text-xl font-semibold">Your company</h1>
      <p className="mb-6 text-sm text-muted-foreground">AutonomOS reads your website and sets up the workspace for you. You only check what it found.</p>
      <CompanyForm suggestedWebsite={user?.email ? suggestedWebsite(user.email) : null} />
    </>
  );
}
