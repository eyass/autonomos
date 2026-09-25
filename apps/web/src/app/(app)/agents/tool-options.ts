import "server-only";
import { isHighRisk, toolsForIntegrations } from "@autonomos/integrations";
import type { ToolOption } from "@/components/agent/config-form";

export function toolOptions(connected: string[]): ToolOption[] {
  return toolsForIntegrations(connected).map((t) => ({ key: t.key, label: t.label, description: t.description, access: t.access, integration: t.integration, highRisk: isHighRisk(t) }));
}
