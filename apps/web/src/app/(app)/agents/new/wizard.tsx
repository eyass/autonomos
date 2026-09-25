"use client";
import type { AgentConfig } from "@autonomos/schemas";
import { AgentConfigForm, type ToolOption } from "@/components/agent/config-form";
import { createAgentAction } from "../actions";

export function NewAgentWizard({ initial, tools, processId, opportunityId }: { initial: AgentConfig; tools: ToolOption[]; processId: string; opportunityId: string }) {
  return <AgentConfigForm initial={initial} tools={tools} submitLabel="Create agent" onSubmit={(config) => createAgentAction({ processId, opportunityId, config })} />;
}
