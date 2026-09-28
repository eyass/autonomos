import { executeRun, refundPolicy } from "@autonomos/agents";
import { buildSandboxTicket, SAMPLE_TICKETS, sandboxSeed } from "@autonomos/integrations";
import { beforeAll, describe, expect, it } from "vitest";
import { createRun, RunNotAllowedError, SupabaseRunStore, sandboxStore } from "../src";
import { service, signUp, uniqueEmail } from "./helpers";

// End-to-end run engine against the real schema: approval stop, resume, idempotent refund.
describe("SupabaseRunStore with the run engine", () => {
  process.env.AI_MOCK = "1";
  const db = service();
  let orgId = "";
  let agentId = "";

  beforeAll(async () => {
    const owner = await signUp(uniqueEmail("runs"));
    const { data } = await owner.client.rpc("create_organization", { p_name: "Runs Org", p_website: "", p_industry: "", p_employee_count: "", p_country: "", p_description: "" });
    orgId = data!;
    for (const key of ["zendesk", "stripe"]) {
      await db.from("integration_connections").insert({ organization_id: orgId, integration_key: key, provider: "sandbox" });
    }
    const sandbox = sandboxStore(db, orgId);
    for (const { system, kind, record } of sandboxSeed()) await sandbox.put(system, kind, record);
    const { data: proc } = await db
      .from("processes")
      .insert({ organization_id: orgId, title: "Refund request handling", estimated_minutes_per_occurrence: 8, status: "reviewed" })
      .select("id")
      .single();
    const { data: agent } = await db
      .from("agents")
      .insert({ organization_id: orgId, process_id: proc!.id, name: "Refund handling", objective: "Resolve refunds", autonomy_level: 3, status: "active" })
      .select("id")
      .single();
    agentId = agent!.id;
    const { data: version } = await db
      .from("agent_versions")
      .insert({
        organization_id: orgId,
        agent_id: agentId,
        version: 1,
        autonomy_level: 3,
        instructions: { objective: "Resolve refunds", context: "", rules: [], steps: [], escalationConditions: [], successConditions: [] },
        trigger_config: { type: "integration_event", event: "zendesk.ticket.created" },
        policy_config: refundPolicy(3) as never,
        model_config: { modelClass: "AGENT_MODEL" },
      })
      .select("id")
      .single();
    await db.from("agent_tools").insert(
      ["zendesk.read_ticket", "stripe.find_customer", "stripe.list_payments", "stripe.list_refunds", "stripe.create_refund", "zendesk.send_reply", "zendesk.update_ticket"].map((tool_key) => ({
        organization_id: orgId,
        agent_version_id: version!.id,
        tool_key,
      })),
    );
    await db.from("agents").update({ active_version_id: version!.id }).eq("id", agentId);
  });

  it("stops for approval, resumes after approval and refunds exactly once", async () => {
    const ticket = buildSandboxTicket(SAMPLE_TICKETS[0]);
    await sandboxStore(db, orgId).put("zendesk", "ticket", ticket);
    const { runId } = await createRun(db, { organizationId: orgId, agentId, mode: "production", trigger: { type: "integration_event" }, input: { ticket_id: ticket.id } });
    const store = new SupabaseRunStore(db);

    const first = await executeRun(runId, store);
    expect(first.status).toBe("waiting_for_approval");
    const { data: approvals } = await db.from("approval_requests").select("*").eq("agent_run_id", runId);
    expect(approvals).toHaveLength(1);
    expect(approvals![0]!.title).toContain("€72.00");

    // Approve everything the L3 agent asks for, resuming the run each time.
    for (let i = 0; i < 5; i++) {
      const { data: pending } = await db.from("approval_requests").select("id").eq("agent_run_id", runId).eq("status", "pending");
      if (!pending?.length) break;
      await db.from("approval_requests").update({ status: "approved", resolved_at: new Date().toISOString() }).eq("id", pending[0]!.id);
      await db.from("human_interventions").insert({ organization_id: orgId, agent_id: agentId, agent_run_id: runId, type: "approval", description: "approved", minutes_spent: 1 });
      await executeRun(runId, store);
      // A duplicate resume (e.g. a retried task) must be harmless.
      await executeRun(runId, store);
    }

    const { data: run } = await db.from("agent_runs").select("*").eq("id", runId).single();
    expect(run!.status).toBe("completed");
    expect(run!.success).toBe(true);
    expect(Number(run!.estimated_minutes_saved)).toBe(5);
    const refunds = (await sandboxStore(db, orgId).list("stripe", "refund")).filter((r) => r.idempotency_key);
    expect(refunds).toHaveLength(1);
    const { data: steps } = await db.from("agent_run_steps").select("sequence").eq("agent_run_id", runId).order("sequence");
    expect(steps!.map((s) => s.sequence)).toEqual(steps!.map((_, i) => i + 1));
    const { count: audits } = await db.from("audit_events").select("id", { count: "exact", head: true }).eq("agent_run_id", runId).eq("action", "tool.executed");
    expect(audits).toBe(3);
  });

  it("refuses production runs for paused organisations", async () => {
    await db.from("organizations").update({ agents_paused: true }).eq("id", orgId);
    await expect(createRun(db, { organizationId: orgId, agentId, mode: "production", trigger: {}, input: {} })).rejects.toThrow(/paused/);
    await db.from("organizations").update({ agents_paused: false }).eq("id", orgId);
  });

  it("stops production runs at the free plan's monthly allowance, never test runs", async () => {
    const { data: agent } = await db.from("agents").select("active_version_id, process_id").eq("id", agentId).single();
    const { count } = await db.from("agent_runs").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("mode", "production");
    const fill = Array.from({ length: Math.max(0, 250 - (count ?? 0)) }, () => ({
      organization_id: orgId,
      agent_id: agentId,
      agent_version_id: agent!.active_version_id!,
      process_id: agent!.process_id,
      mode: "production" as const,
      trigger: { type: "manual" },
      input: {},
    }));
    if (fill.length) await db.from("agent_runs").insert(fill);
    const production = { organizationId: orgId, agentId, mode: "production" as const, trigger: { type: "manual" }, input: {} };
    await expect(createRun(db, production)).rejects.toBeInstanceOf(RunNotAllowedError);
    await expect(createRun(db, production)).rejects.toThrow(/250 production runs/);
    await expect(createRun(db, { ...production, mode: "test" })).resolves.toHaveProperty("runId");
    // Paid plans keep running above the allowance (billed as overage).
    await db.from("organizations").update({ plan: "starter" }).eq("id", orgId);
    await expect(createRun(db, production)).resolves.toHaveProperty("runId");
  });
});
