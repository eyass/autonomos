import { executeRun } from "./src";
import { refunds, setup, ticket } from "./test/fixtures";
for (const [label, level, sample] of [["L4 routine €72", 4, "routine"], ["L4 recent-refund €240", 4, "large"], ["L4 injection", 4, "injection"]] as const) {
  const { store, runId, ticketId } = setup({ level, ticket: sample });
  process.env.AI_MOCK = "0";
  const t0 = Date.now();
  let r = await executeRun(runId, store);
  if (r.status === "waiting_for_approval") {
    const a = [...store.approvals.values()][0]!;
    console.log(`  approval requested: "${a.title}"`);
    store.resolveApproval(a.id, "approved");
    r = await executeRun(runId, store);
  }
  const steps = store.steps.filter((s) => s.type === "decision" || s.type === "action" || s.type === "policy" || s.type === "escalated").map((s) => `${s.type}:${s.tool ?? ""}:${s.status}`);
  console.log(label, JSON.stringify(r), `${((Date.now() - t0) / 1000).toFixed(1)}s`, "refunds:", (await refunds(store)).map((x) => x.amount), "ticket:", (await ticket(store, ticketId))?.status);
  console.log("  steps:", steps.join(" | "));
  console.log("  cost $", store.usage.reduce((s, u) => s + u.estimatedCost, 0).toFixed(4), "calls", store.usage.length);
}
