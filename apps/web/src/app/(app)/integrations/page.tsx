import { isAdmin, requireSession } from "@/lib/session";
import { loadIntegrations } from "./data";
import { IntegrationGrid } from "./grid";
import { AddSystems } from "./add-systems";
import { canUseComposio } from "@/server/integrations";
import { PageHeader } from "@/components/app/page-header";
import { LiveRefresh } from "../activity/[runId]/live";

export const metadata = { title: "Integrations" };
// Connecting and mapping a system run their first inventory after the response.
export const maxDuration = 300;

export default async function IntegrationsPage() {
  const session = await requireSession();
  const integrations = await loadIntegrations(session);
  const mapping = integrations.some((i) => i.inventory?.state === "running");
  return (
    <>
      <LiveRefresh active={mapping} />
      <PageHeader
        title="Integrations"
        description="Connecting gives no agent access by itself. Each agent gets its own list of allowed actions."
        actions={canUseComposio() ? <AddSystems canManage={isAdmin(session)} /> : null}
      />
      {!isAdmin(session) ? <p className="mb-4 text-sm text-muted-foreground">Only admins can connect or disconnect integrations.</p> : null}
      <IntegrationGrid integrations={integrations} canManage={isAdmin(session)} highlight={session.org.detectedTools} />
    </>
  );
}
