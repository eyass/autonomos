import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, getUser } from "@/lib/session";
import { suggestedWebsite } from "@/server/company-profile";
import { latestJob } from "@/server/jobs";
import { Steps } from "../steps";
import { CompanyForm } from "./form";

export const metadata = { title: "Your company" };

export default async function CompanyPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const session = await getSession();
  // ?new=1 creates another workspace for someone who already has one.
  const adding = (await searchParams).new === "1";
  if (session && !adding) redirect(session.org.onboardingCompletedAt ? "/" : session.org.onboardingStep === "connect" ? "/onboarding/connect" : "/onboarding/about");
  const user = await getUser();
  const job = user ? await latestJob({ userId: user.id, organizationId: null, kind: "website_profile", includeDone: !adding }) : null;
  return (
    <>
      <Steps current={0} />
      {adding && session ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Creating a new workspace.{" "}
          <Link className="underline" href="/">
            Back to {session.org.name}
          </Link>
        </p>
      ) : null}
      <h1 className="mb-1 text-xl font-semibold">Your company</h1>
      <p className="mb-6 text-sm text-muted-foreground">AutonomOS reads your website and sets up the workspace for you. You only check what it found.</p>
      <CompanyForm suggestedWebsite={user?.email ? suggestedWebsite(user.email) : null} initialJob={job} />
    </>
  );
}
