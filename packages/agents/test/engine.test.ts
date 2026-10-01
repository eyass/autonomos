import { describe, expect, it } from "vitest";
import { ToolError } from "@autonomos/integrations";
import { executeRun, RetryableRunError } from "../src";
import { refunds, setup, ticket } from "./fixtures";

describe("run engine: refund workflow", () => {
  it("Approve mode stops for approval, then executes exactly once after approval", async () => {
    const { store, runId, ticketId } = setup({ level: 3 });
    const first = await executeRun(runId, store);
    expect(first.status).toBe("waiting_for_approval");
    expect(await refunds(store)).toHaveLength(0);
    const approval = [...store.approvals.values()][0]!;
    expect(approval.title).toMatch(/Refund €72\.00 to customer\?/);

    // Re-running while pending does nothing.
    expect((await executeRun(runId, store)).status).toBe("waiting_for_approval");

    store.resolveApproval(approval.id, "approved");
    const second = await executeRun(runId, store);
    // The reply and ticket update also require approval in Approve mode.
    expect(second.status).toBe("waiting_for_approval");
    expect(await refunds(store)).toHaveLength(1);

    for (let i = 0; i < 4; i++) {
      const pending = [...store.approvals.values()].find((a) => a.status === "pending");
      if (!pending) break;
      store.resolveApproval(pending.id, "approved");
      await executeRun(runId, store);
    }
    const result = store.result(runId);
    expect(result.status).toBe("completed");
    expect(result.success).toBe(true);
    expect(await refunds(store)).toHaveLength(1);
    const t = await ticket(store, ticketId);
    expect(t?.status).toBe("solved");
    expect((t?.comments as unknown[]).length).toBe(1);
    // Baseline 8 minutes minus 3 approvals at 1 minute each.
    expect(result.estimatedMinutesSaved).toBe(5);
  });

  it("Auto executes a routine refund without approval", async () => {
    const { store, runId, ticketId } = setup({ level: 4 });
    const r = await executeRun(runId, store);
    expect(r).toMatchObject({ status: "completed", success: true });
    expect(store.approvals.size).toBe(0);
    const [refund] = await refunds(store);
    expect(refund?.amount).toBe(72);
    expect((await ticket(store, ticketId))?.status).toBe("solved");
    expect(store.result(runId).estimatedMinutesSaved).toBe(8);
    expect(store.audit.filter((a) => a.action === "tool.executed")).toHaveLength(3);
  });

  it("Auto asks for approval when the customer had a recent refund", async () => {
    const { store, runId } = setup({ level: 4, ticket: "large" });
    expect((await executeRun(runId, store)).status).toBe("waiting_for_approval");
    const approval = [...store.approvals.values()][0]!;
    expect(approval.title).toMatch(/€240/);
  });

  it("a modified approval executes the modified amount", async () => {
    const { store, runId } = setup({ level: 4, ticket: "large" });
    await executeRun(runId, store);
    const approval = [...store.approvals.values()][0]!;
    store.resolveApproval(approval.id, "modified", { amount: 50 });
    const r = await executeRun(runId, store);
    expect(r.status).toBe("completed");
    const [refund] = await refunds(store);
    expect(refund?.amount).toBe(50);
  });

  it("a rejected approval never executes and the agent takes the alternative route", async () => {
    const { store, runId, ticketId } = setup({ level: 4, ticket: "large" });
    await executeRun(runId, store);
    store.resolveApproval([...store.approvals.values()][0]!.id, "rejected");
    const r = await executeRun(runId, store);
    expect(r).toMatchObject({ status: "completed", success: false });
    expect(await refunds(store)).toHaveLength(0);
    expect((await ticket(store, ticketId))?.status).toBe("pending");
  });

  it("suspicious instructions in a ticket escalate without any write", async () => {
    const { store, runId } = setup({ level: 4, ticket: "injection" });
    const r = await executeRun(runId, store);
    expect(r).toMatchObject({ status: "completed", outcome: "escalated" });
    expect(store.actions.size).toBe(0);
    expect(store.interventions.some((i) => i.type === "exception")).toBe(true);
  });

  it("test mode simulates writes and lists approvals that would be required", async () => {
    const { store, runId, ticketId } = setup({ level: 3, mode: "test" });
    const r = await executeRun(runId, store);
    expect(r.status).toBe("completed");
    expect(await refunds(store)).toHaveLength(0);
    expect((await ticket(store, ticketId))?.status).toBe("open");
    expect(store.approvals.size).toBe(0);
    const output = store.result(runId).output as { wouldRequireApproval: Array<{ tool: string }> };
    expect(output.wouldRequireApproval.map((w) => w.tool)).toContain("stripe.create_refund");
    expect(store.result(runId).estimatedMinutesSaved).toBe(0);
  });

  it("emergency pause while waiting prevents the approved write", async () => {
    const { store, runId } = setup({ level: 3 });
    await executeRun(runId, store);
    store.resolveApproval([...store.approvals.values()][0]!.id, "approved");
    store.paused = true;
    const r = await executeRun(runId, store);
    expect(r.status).toBe("cancelled");
    expect(await refunds(store)).toHaveLength(0);
  });

  it("an expired approval cancels the run", async () => {
    const { store, runId } = setup({ level: 3 });
    await executeRun(runId, store);
    store.resolveApproval([...store.approvals.values()][0]!.id, "expired");
    expect((await executeRun(runId, store)).status).toBe("cancelled");
    expect(await refunds(store)).toHaveLength(0);
  });

  it("a retry after a timeout during the refund never refunds twice", async () => {
    const { store, runId } = setup({ level: 4 });
    const sandbox = store.sandbox.bind(store);
    let failOnce = true;
    store.sandbox = () => {
      const s = sandbox();
      return {
        ...s,
        put: async (system, kind, record) => {
          await s.put(system, kind, record);
          // Simulate the provider processing the refund but the response timing out.
          if (system === "stripe" && kind === "refund" && failOnce) {
            failOnce = false;
            throw new ToolError("timeout", "Stripe timed out");
          }
        },
      };
    };
    await expect(executeRun(runId, store)).rejects.toBeInstanceOf(RetryableRunError);
    expect(await refunds(store)).toHaveLength(1);
    const r = await executeRun(runId, store);
    expect(r).toMatchObject({ status: "completed", success: true });
    expect(await refunds(store)).toHaveLength(1);
  });

  it("a paused agent cannot execute in production", async () => {
    const { store, runId } = setup({ level: 4 });
    store.agentStatus = "paused";
    const r = await executeRun(runId, store);
    expect(r).toMatchObject({ status: "completed", outcome: "escalated" });
    expect(store.actions.size).toBe(0);
  });

  it("completed runs are never re-executed", async () => {
    const { store, runId } = setup({ level: 4 });
    await executeRun(runId, store);
    expect((await executeRun(runId, store)).status).toBe("noop");
    expect(await refunds(store)).toHaveLength(1);
  });
});
