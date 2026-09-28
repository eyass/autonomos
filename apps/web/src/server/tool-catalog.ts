import "server-only";
import { BUILTIN_INTEGRATIONS, composioToolsFor, registerSnapshots, toolsForIntegrations, type ToolDefinition, type ToolSnapshot } from "@autonomos/integrations";
import { adminDb, type Session } from "@/lib/session";
import { connectedIntegrationKeys } from "./opportunities";

// Every tool an agent in this workspace may be given: the built-in tools of connected built-in
// systems, and the Composio actions of every other connected toolkit. All live third-party calls
// go through Composio either way. Loading also registers the Composio tools for getTool.
export async function availableTools(session: Session, connected?: string[]): Promise<ToolDefinition[]> {
  const keys = connected ?? (await connectedIntegrationKeys(session));
  const composio = await Promise.all(
    keys
      .filter((k) => k !== "knowledge" && !BUILTIN_INTEGRATIONS.has(k))
      .map((k) =>
        composioToolsFor(k).catch((e) => {
          console.error("composio tools", k, e);
          return [] as ToolDefinition[];
        }),
      ),
  );
  return [...toolsForIntegrations(keys), ...composio.flat()];
}

// Registers every Composio tool definition stored on this workspace's agent versions, for pages
// that show tools by name (history, approvals, integrations, version changes).
export async function registerWorkspaceTools(organizationId: string) {
  const { data } = await adminDb().from("agent_tools").select("definition").eq("organization_id", organizationId).not("definition", "is", null);
  registerSnapshots((data ?? []).map((r) => r.definition as unknown as ToolSnapshot | null));
}
