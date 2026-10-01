import { beforeAll, describe, expect, it } from "vitest";
import { healConnections, healRuns } from "../src";
import { service, signUp, uniqueEmail } from "./helpers";

// Self-healing: a stuck run is started again once, then closed; a lost resume after an approval
// is redone; a connection whose sign-in stopped working is marked and restored by itself.
describe("self-healing", () => {
  const db = service();
  let orgId = "";
  let agentId = "";
  let versionId = "";
  let processId = "";
  const enqueued: string[] = [];
  const enqueue = async (runId: string) => {
    enqueued.push(runId);
  };
  const run = async (fields: Record<string, unknown>) =>
    (
      await db
        .from("agent_runs")
        .insert({ organization_id: orgId, agent_id: agentId, agent_version_id: versionId, process_id: processId, mode: "production", trigger: {}, ...fields } as never)
        .select("id")
        .single()
    ).data!.id;

  beforeAll(async () => {
    const owner = await signUp(uniqueEmail("heal"));
    orgId = (await owner.client.rpc("create_organization", { p_name: "Heal Org", p_website: "", p_industry: "", p_employee_count: "", p_country: "", p_description: "" })).data!;
    processId = (await db.from("processes").insert({ organization_id: orgId, title: "Work", status: "reviewed" }).select("id").single()).data!.id;
    agentId = (
      await db
        .from("agents")
        .insert({ organization_id: orgId, process_id: processId, name: "Worker", objective: "Work", autonomy_level: 2, status: "active" })
        .select("id")
        .single()
    ).data!.id;
    versionId = (
      await db
        .from("agent_versions")
        .insert({
          organization_id: orgId,
          agent_id: agentId,
          version: 1,
          autonomy_level: 2,
          instructions: { objective: "Work", context: "", rules: [], steps: [], escalationConditions: [], successConditions: [] },
          trigger_config: { type: "manual" },
          policy_config: {} as never,
          model_config: { modelClass: "AGENT_MODEL" },
        })
        .select("id")
        .single()
    ).data!.id;
  });

  it("starts a run nobody picked up again once, then closes it with a reason", async () => {
    const old = new Date(Date.now() - 15 * 60_000).toISOString();
    const id = await run({ status: "queued", queued_at: old });
    const first = await healRuns(db, enqueue, orgId);
    expect(first.restarted).toContain(id);
    expect(enqueued).toContain(id);
    // Still not picked up after the restart: closed, not restarted again.
    await db.from("agent_runs").update({ queued_at: old }).eq("id", id);
    const second = await healRuns(db, enqueue, orgId);
    expect(second.closed).toContain(id);
    const { data } = await db.from("agent_runs").select("status, error").eq("id", id).single();
    expect(data!.status).toBe("failed");
    expect(data!.error).toMatch(/also after AutonomOS started it again/);
  });

  it("leaves a long run alone while it shows signs of life", async () => {
    const id = await run({ status: "running", started_at: new Date(Date.now() - 60 * 60_000).toISOString(), heartbeat_at: new Date().toISOString() });
    const r = await healRuns(db, enqueue, orgId);
    expect([...r.restarted, ...r.closed]).not.toContain(id);
  });

  it("resumes a run whose approval was decided but never continued", async () => {
    const id = await run({ status: "waiting_for_approval", started_at: new Date().toISOString() });
    const { error: approvalError } = await db.from("approval_requests").insert({
      organization_id: orgId,
      agent_run_id: id,
      agent_id: agentId,
      title: "Approve",
      action_type: "refund",
      tool: "stripe.create_refund",
      proposed_action: {},
      status: "approved",
      resolved_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    } as never);
    expect(approvalError).toBeNull();
    const r = await healRuns(db, enqueue, orgId);
    expect(r.resumed).toContain(id);
  });

  it("marks a connection whose sign-in expired, and restores it when it works again", async () => {
    const { error: connError } = await db
      .from("integration_connections")
      .insert({ organization_id: orgId, integration_key: "zendesk", provider: "composio", external_account_id: "ca_test_heal" });
    expect(connError).toBeNull();
    const mine = (s: string) => async (id: string) => (id === "ca_test_heal" ? s : "ACTIVE");
    expect((await healConnections(db, mine("EXPIRED"))).broken).toContain(`${orgId}:zendesk`);
    const { data: broken } = await db.from("integration_connections").select("status, last_error").eq("organization_id", orgId).eq("integration_key", "zendesk").single();
    expect(broken).toMatchObject({ status: "error" });
    expect(broken!.last_error).toMatch(/Reconnect/);
    expect((await healConnections(db, mine("ACTIVE"))).restored).toContain(`${orgId}:zendesk`);
  });
});
