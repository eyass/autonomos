import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/session";
import { loadAgentConfig } from "@/server/agents";
import { connectedIntegrationKeys } from "@/server/opportunities";
import { toolOptions } from "../../tool-options";
import { EditAgentForm } from "./form";

export default async function EditAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const { agent, version, config } = await loadAgentConfig(session, id);
  const connected = await connectedIntegrationKeys(session);
  return (
    <>
      <PageHeader back={{ href: `/agents/${id}`, label: agent.name }} title={`Edit ${agent.name}`} description={`Currently version ${version.version}. Saving creates version ${version.version + 1}; past runs keep pointing at the version they used.`} />
      <EditAgentForm agentId={id} initial={config} tools={toolOptions(connected)} />
    </>
  );
}
