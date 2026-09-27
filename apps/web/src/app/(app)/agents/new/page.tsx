import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { defaultAgentConfig } from "@/server/opportunities";
import { toolOptions } from "../tool-options";
import { NewAgentWizard } from "./wizard";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Test runs execute on this server after the response, so give them room to finish.
export const maxDuration = 300;

export const metadata = { title: "Create agent" };

export default async function NewAgentPage({ searchParams }: { searchParams: Promise<{ opportunity?: string }> }) {
  const session = await requireSession();
  const { opportunity } = await searchParams;
  if (!opportunity) redirect("/opportunities");
  const { opportunity: o, config: initial, connected } = await defaultAgentConfig(session, opportunity);
  return (
    <>
      <PageHeader back={{ href: `/opportunities/${o.id}`, label: o.title }} title="Create agent" description={`From the opportunity "${o.title}". Everything is pre-filled; check each step.`} />
      {!connected.length ? (
        <Alert variant="warning" className="mb-4">
          <AlertDescription>No integrations are connected, so the agent has nothing it can act on yet.</AlertDescription>
        </Alert>
      ) : null}
      <NewAgentWizard initial={initial} tools={toolOptions(connected)} processId={o.process_id} opportunityId={o.id} />
    </>
  );
}
