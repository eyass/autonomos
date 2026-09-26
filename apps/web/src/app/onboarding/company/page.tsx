import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Steps } from "../steps";
import { CompanyForm } from "./form";

export const metadata = { title: "Create your company" };

export default async function CompanyPage() {
  const session = await getSession();
  if (session) redirect(session.org.onboardingCompletedAt ? "/" : "/onboarding/about");
  return (
    <>
      <Steps current={0} />
      <h1 className="mb-1 text-xl font-semibold">Create your company</h1>
      <p className="mb-6 text-sm text-muted-foreground">This is the workspace your processes, agents and approvals live in.</p>
      <CompanyForm />
    </>
  );
}
