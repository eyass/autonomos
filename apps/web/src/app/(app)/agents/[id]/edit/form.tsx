"use client";
import type { AgentConfig } from "@autonomos/schemas";
import { AgentConfigForm, type ToolOption } from "@/components/agent/config-form";
import { updateAgentAction } from "../../actions";

export function EditAgentForm({ agentId, initial, tools }: { agentId: string; initial: AgentConfig; tools: ToolOption[] }) {
  return <AgentConfigForm initial={initial} tools={tools} submitLabel="Save as new version" showNote onSubmit={(config, note) => updateAgentAction(agentId, config, note)} />;
}
