import { refundPolicy } from "@autonomos/agents";
import { buildSandboxTicket, SAMPLE_TICKETS } from "@autonomos/integrations";
import { beforeAll, describe, expect, it } from "vitest";
import { checkRecordWatches, sandboxStore } from "../src";
import { service, signUp, uniqueEmail } from "./helpers";

// "Each new record" triggers: the first look is a baseline, each new ticket starts exactly one run.
describe("record watches", () => {
  const db = service();
  let orgId = "";
  let agentId = "";
  const mine = async () => (await checkRecordWatches(db)).find((r) => r.agentId === agentId)!;

  beforeAll(async () => {
    const owner = await signUp(uniqueEmail("watch"));
    const { data } = await owner.client.rpc("create_organization", { p_name: "Watch Org", p_website: "", p_industry: "", p_employee_count: "", p_country: "", p_description: "" });
    orgId = data!;
    await db.from("integration_connections").insert({ organization_id: orgId, integration_key: "zendesk", provider: "sandbox" });
    await sandboxStore(db, orgId).put("zendesk", "ticket", buildSandboxTicket(SAMPLE_TICKETS[0], new Date(Date.now() - 3_600_000)));
    const { data: proc } = await db.from("processes").insert({ organization_id: orgId, title: "Ticket triage", status: "reviewed" }).select("id").single();
    const { data: agent } = await db
      .from("agents")
      .insert({ organization_id: orgId, process_id: proc!.id, name: "Ticket triage", objective: "Triage tickets", autonomy_level: 2, status: "active" })
      .select("id")
      .single();
    agentId = agent!.id;
    const { data: version } = await db
      .from("agent_versions")
      .insert({
        organization_id: orgId,
        agent_id: agentId,
        version: 1,
        autonomy_level: 2,
        instructions: { objective: "Triage tickets", context: "", rules: [], steps: [], escalationConditions: [], successConditions: [] },
        trigger_config: { type: "new_record", integration: "zendesk" },
        policy_config: refundPolicy(2) as never,
        model_config: { modelClass: "AGENT_MODEL" },
      })
      .select("id")
      .single();
    await db.from("agents").update({ active_version_id: version!.id }).eq("id", agentId);
  });

  it("marks what is already there as seen without running it", async () => {
    const first = await mine();
    expect(first).toMatchObject({ seeded: 1, started: [] });
    const { count } = await db.from("agent_runs").select("id", { count: "exact", head: true }).eq("agent_id", agentId);
    expect(count).toBe(0);
  });

  it("starts one run per new ticket, with the ticket as input, and never twice", async () => {
    const ticket = buildSandboxTicket(SAMPLE_TICKETS[1] ?? SAMPLE_TICKETS[0]);
    await sandboxStore(db, orgId).put("zendesk", "ticket", ticket);
    // A ticket a test run made is never live work.
    await sandboxStore(db, orgId).put("zendesk", "ticket", { ...buildSandboxTicket(SAMPLE_TICKETS[0]), test: true });
    const second = await mine();
    expect(second.started).toHaveLength(1);
    const { data: run } = await db.from("agent_runs").select("mode, trigger, input").eq("id", second.started[0]!).single();
    expect(run).toMatchObject({
      mode: "production",
      trigger: { type: "new_record", integration: "zendesk", record_id: ticket.id },
      input: { record_id: ticket.id, ticket_id: ticket.id, record_kind: "ticket" },
    });
    expect((await mine()).started).toHaveLength(0);
  });

  it("forgets the watch when the agent stops listening, and starts fresh when it listens again", async () => {
    await db.from("agents").update({ status: "paused" }).eq("id", agentId);
    await checkRecordWatches(db);
    const { count } = await db.from("agent_record_watches").select("agent_id", { count: "exact", head: true }).eq("agent_id", agentId);
    expect(count).toBe(0);
    await sandboxStore(db, orgId).put("zendesk", "ticket", buildSandboxTicket(SAMPLE_TICKETS[0]));
    await db.from("agents").update({ status: "active" }).eq("id", agentId);
    // Tickets that arrived while it was paused are a baseline, not a backlog.
    expect(await mine()).toMatchObject({ started: [], seeded: 3 });
  });
});
