import "server-only";
import { getTool, isHighRisk } from "@autonomos/integrations";
import type { ToolOption } from "@/components/agent/config-form";
import type { Session } from "@/lib/session";
import { availableTools } from "@/server/tool-catalog";

// Every tool the agent may be given: built-in tools and each connected toolkit's Composio actions.
// Tools the agent already has stay listed, even if the toolkit no longer offers them by default.
export async function toolOptions(session: Session, connected: string[], keep: string[] = []): Promise<ToolOption[]> {
  const list = await availableTools(session, connected);
  const seen = new Set(list.map((t) => t.key));
  const kept = keep
    .filter((k) => !seen.has(k))
    .map((k) => getTool(k))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  return [...list, ...kept].map((t) => ({ key: t.key, label: t.label, description: t.description, access: t.access, integration: t.integration, highRisk: isHighRisk(t) }));
}
