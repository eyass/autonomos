"use server";
import { SAMPLE_TICKETS } from "@autonomos/integrations";
import { AgentConfigSchema } from "@autonomos/schemas";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction } from "@/lib/actions";
import { checkTestInput } from "@/lib/test-input";
import { HttpError, requireSessionOrThrow } from "@/lib/session";
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
import { defaultAgentConfig } from "@/server/opportunities";

export async function createAgentAction(input: { processId: string; opportunityId: string | null; config: unknown }) {
  const result = await runAction(async () =>
    createAgent(await requireSessionOrThrow(), { processId: z.string().uuid().parse(input.processId), opportunityId: input.opportunityId, config: AgentConfigSchema.parse(input.config) }),
  );
  if (!result.ok) return result;
  redirect(`/agents/${result.data}?created=1`);
}

// One click from an opportunity to a tested agent: build it from the proposed
// configuration, then run a simulated test straight away.
export async function buildAndTestAgentAction(opportunityId: string) {
  const result = await runAction(async () => {
    const session = await requireSessionOrThrow();
    const { opportunity, config } = await defaultAgentConfig(session, z.string().uuid().parse(opportunityId));
    if (!config.tools.length) throw new HttpError(409, "Connect the systems this agent needs first");
    const agentId = await createAgent(session, { processId: opportunity.process_id, opportunityId: opportunity.id, config });
    const runId = config.tools.includes("zendesk.read_ticket") ? await startTestRunWithSample(session, agentId, SAMPLE_TICKETS[0]!.key) : await startTestRun(session, agentId, {});
    return runId;
  });
  if (!result.ok) return result;
  redirect(`/activity/${result.data}?built=1`);
}

export async function updateAgentAction(agentId: string, config: unknown, note: string) {
  const result = await runAction(async () => updateAgentConfig(await requireSessionOrThrow(), agentId, AgentConfigSchema.parse(config), note || "Configuration edited"));
  if (!result.ok) return result;
  redirect(`/agents/${agentId}`);
}

// A test with warnings on its input runs only when the person said to run it anyway.
export async function testRunAction(agentId: string, input: Record<string, unknown>, acknowledged = false) {
  const result = await runAction(async () => {
    const session = await requireSessionOrThrow();
    const check = checkTestInput(input);
    if (check.errors.length) throw new HttpError(400, check.errors.join(" "));
    if (check.warnings.length && !acknowledged) throw new HttpError(400, `Confirm to run with these warnings: ${check.warnings.join(" ")}`);
    return startTestRun(session, agentId, check.value!);
  });
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
      maxWithoutApproval === undefined || maxWithoutApproval === null
        ? undefined
        : { amountThresholds: [{ tool: "stripe.create_refund", field: "amount", maxWithoutApproval: z.number().nonnegative().parse(maxWithoutApproval) }] },
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
