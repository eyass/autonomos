import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { IntegrationGrid } from "@/app/(app)/integrations/grid";
import { loadIntegrations } from "@/app/(app)/integrations/data";
import { ActionButton } from "@/components/action-button";
import { Steps } from "../steps";
import { finishOnboardingAction } from "../actions";

export const metadata = { title: "Connect systems" };

export default async function ConnectPage() {
  const session = await getSession();
  if (!session) redirect("/onboarding/company");
  const integrations = await loadIntegrations(session);
  return (
    <>
      <Steps current={2} />
      <h1 className="mb-1 text-xl font-semibold">Connect systems</h1>
      <p className="mb-6 text-sm text-muted-foreground">Connect what you use. Nothing is required for process discovery; agents only get access to the specific actions you allow later.</p>
      <IntegrationGrid integrations={integrations} canManage={session.role !== "member"} compact />
      <div className="mt-6">
        <ActionButton action={finishOnboardingAction}>Continue</ActionButton>
      </div>
    </>
  );
}
