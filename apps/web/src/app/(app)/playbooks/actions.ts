"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
import { startFromPlaybook } from "@/server/playbooks";

const Input = z.object({
  occurrencesPerMonth: z.coerce.number().positive("Say roughly how often this happens each month").max(1_000_000),
  minutesPerOccurrence: z.coerce.number().positive("Say roughly how many minutes it takes each time").max(100_000),
});

// Starts the workspace on a playbook, then opens the idea it made.
export async function startPlaybookAction(id: string, form: FormData) {
  const result = await runAction(async () => {
    const session = await requireSessionOrThrow();
    const input = Input.parse({ occurrencesPerMonth: form.get("occurrencesPerMonth"), minutesPerOccurrence: form.get("minutesPerOccurrence") });
    return startFromPlaybook(session, id, input);
  });
  if (result.ok) redirect(`/opportunities/${result.data}?playbook=1`);
  return result;
}
