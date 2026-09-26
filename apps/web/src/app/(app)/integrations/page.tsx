import { isAdmin, requireSession } from "@/lib/session";
import { loadIntegrations } from "./data";
import { IntegrationGrid } from "./grid";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const session = await requireSession();
  const integrations = await loadIntegrations(session);
  return (
    <>
      <PageHeader title="Integrations" description="Systems AutonomOS can read from and act in. Connecting does not give any agent access; each agent gets an explicit list of allowed actions." />
      {!isAdmin(session) ? <p className="mb-4 text-sm text-muted-foreground">Only admins can connect or disconnect integrations.</p> : null}
      <IntegrationGrid integrations={integrations} canManage={isAdmin(session)} highlight={session.org.detectedTools} />
    </>
  );
}
