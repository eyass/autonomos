import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Steps } from "../steps";
import { AboutForm } from "./form";

export const metadata = { title: "About your company" };

export default async function AboutPage() {
  const session = await getSession();
  if (!session) redirect("/onboarding/company");
  return (
    <>
      <Steps current={1} />
      <h1 className="mb-1 text-xl font-semibold">Tell us about {session.org.name}</h1>
      <p className="mb-6 text-sm text-muted">This context shapes how processes are discovered and how agents talk about your business.</p>
      <AboutForm summary={session.org.companySummary ?? session.org.description ?? ""} areas={session.org.improvementAreas} />
    </>
  );
}
