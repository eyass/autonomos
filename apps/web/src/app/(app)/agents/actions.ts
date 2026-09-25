"use server";
import { AgentConfigSchema } from "@autonomos/schemas";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
import {
  activateAgent,
  changeAutonomy,
  createAgent,
  pauseAgent,
  recordFeedback,
  simulateSandboxTicket,
  startProductionRun,
  startTestRun,
  startTestRunWithSample,
  updateAgentConfig,
} from "@/server/agents";

export async function createAgentAction(input: { processId: string; opportunityId: string | null; config: unknown }) {
  const result = await runAction(async () =>
    createAgent(await requireSessionOrThrow(), { processId: z.string().uuid().parse(input.processId), opportunityId: input.opportunityId, config: AgentConfigSchema.parse(input.config) }),
  );
  if (!result.ok) return result;
  redirect(`/agents/${result.data}?created=1`);
}

export async function updateAgentAction(agentId: string, config: unknown, note: string) {
  const result = await runAction(async () => updateAgentConfig(await requireSessionOrThrow(), agentId, AgentConfigSchema.parse(config), note || "Configuration edited"));
  if (!result.ok) return result;
  redirect(`/agents/${agentId}`);
}

export async function testRunAction(agentId: string, input: Record<string, unknown>) {
  const result = await runAction(async () => startTestRun(await requireSessionOrThrow(), agentId, input));
  if (!result.ok) return result;
  redirect(`/activity/${result.data}`);
}

export async function testRunSampleAction(agentId: string, sampleKey: string) {
  const result = await runAction(async () => startTestRunWithSample(await requireSessionOrThrow(), agentId, sampleKey));
  if (!result.ok) return result;
  redirect(`/activity/${result.data}`);
}

export async function runNowAction(agentId: string, input: Record<string, unknown>) {
  const result = await runAction(async () => startProductionRun(await requireSessionOrThrow(), agentId, input));
  if (!result.ok) return result;
  redirect(`/activity/${result.data}`);
}

export async function activateAction(agentId: string) {
  return runAction(async () => activateAgent(await requireSessionOrThrow(), agentId));
}

export async function pauseAction(agentId: string) {
  return runAction(async () => pauseAgent(await requireSessionOrThrow(), agentId));
}

export async function changeAutonomyAction(agentId: string, level: number, maxWithoutApproval?: number | null) {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    const lvl = z.number().int().min(1).max(5).parse(level);
    await changeAutonomy(
      session,
      agentId,
      lvl,
      maxWithoutApproval === undefined || maxWithoutApproval === null ? undefined : { amountThresholds: [{ tool: "stripe.create_refund", field: "amount", maxWithoutApproval: z.number().nonnegative().parse(maxWithoutApproval) }] },
    );
  });
}

export async function simulateTicketAction(sampleKey: string) {
  const result = await runAction(async () => simulateSandboxTicket(await requireSessionOrThrow(), sampleKey));
  if (!result.ok) return result;
  const runId = result.data?.runIds[0];
  if (runId) redirect(`/activity/${runId}`);
  return { ok: false as const, error: "The ticket arrived, but no active agent is listening for new Zendesk tickets. Activate the agent first." };
}

export async function feedbackAction(runId: string, verdict: "correct" | "incorrect", expected?: string) {
  return runAction(async () => recordFeedback(await requireSessionOrThrow(), runId, verdict, expected));
}
