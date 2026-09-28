"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
import { startFromPlaybook } from "@/server/playbooks";

const Input = z.object({
  occurrencesPerMonth: z.coerce.number().positive("Say roughly how often this happens each month").max(1_000_000),
  minutesPerOccurrence: z.coerce.number().positive("Say roughly how many minutes it takes each time").max(100_000),
  bindings: z.record(z.string().max(40), z.string().max(80)),
  complianceOwner: z.string().trim().max(120).optional(),
  policy: z.record(z.string().max(40), z.string().max(200)).optional(),
});

// Starts the workspace on a playbook with the tools chosen for each step, then opens the idea it made.
export async function startPlaybookAction(
  id: string,
  raw: { occurrencesPerMonth: string; minutesPerOccurrence: string; bindings: Record<string, string>; complianceOwner?: string; policy?: Record<string, string> },
) {
  const result = await runAction(async () => startFromPlaybook(await requireSessionOrThrow(), id, Input.parse(raw)));
  if (result.ok) redirect(`/opportunities/${result.data}?playbook=1`);
  return result;
}
