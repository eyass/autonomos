import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { companyBrief, listSources, startWebsiteSourcesInBackground } from "@/server/knowledge";
import { Steps } from "../steps";
import { KnowledgeStep } from "./step";

export const metadata = { title: "Teach AutonomOS about you" };

export default async function OnboardingKnowledgePage() {
  const session = await getSession();
  if (!session) redirect("/onboarding/company");
  if (session.org.onboardingCompletedAt) redirect("/knowledge");
  const sources = await listSources(session);
  // The whole website and its help centre start reading as soon as the step opens.
  if (!sources.some((s) => s.kind === "website")) startWebsiteSourcesInBackground(session);
  const { brief } = await companyBrief(session);
  return (
    <>
      <Steps current={1} />
      <h1 className="mb-1 text-xl font-semibold">Teach AutonomOS about you</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        We are reading your whole website and help centre now. Add what the website does not say: support documents, policies, handbooks. Your agents follow them.
      </p>
      <KnowledgeStep sources={sources} brief={brief} />
    </>
  );
}
