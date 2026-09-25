import { buildSandboxTicket, SAMPLE_TICKETS, sandboxSeed } from "@autonomos/integrations";
import { MemoryRunStore, refundPolicy, emptyRunState, type RunContext } from "../src";

export const REFUND_TOOLS = [
  "zendesk.read_ticket",
  "stripe.find_customer",
  "stripe.list_payments",
  "stripe.list_refunds",
  "stripe.create_refund",
  "zendesk.send_reply",
  "zendesk.update_ticket",
];

export function setup(opts: { level?: 1 | 2 | 3 | 4 | 5; mode?: "test" | "production"; ticket?: "routine" | "large" | "injection" } = {}) {
  process.env.AI_MOCK = "1";
  const store = new MemoryRunStore();
  for (const { system, kind, record } of sandboxSeed()) store.sandboxData.set(`${system}/${kind}/${record.id}`, record);
  const sample = SAMPLE_TICKETS.find((t) => t.key === (opts.ticket ?? "routine"))!;
  const ticket = buildSandboxTicket(sample);
  store.sandboxData.set(`zendesk/ticket/${ticket.id}`, ticket);
  const level = opts.level ?? 3;
  const ctx: RunContext = {
    run: {
      id: `run_${Math.random().toString(36).slice(2)}`,
      organizationId: "org_1",
      agentId: "agent_1",
      agentVersionId: "ver_1",
      processId: "proc_1",
      mode: opts.mode ?? "production",
      status: "queued",
      input: { ticket_id: ticket.id },
      state: emptyRunState(),
      inputTokens: 0,
      outputTokens: 0,
      modelCost: 0,
      model: null,
    },
    agent: { id: "agent_1", name: "Refund handling", status: "active" },
    version: {
      id: "ver_1",
      version: 1,
      autonomyLevel: level,
      instructions: { objective: "Resolve refunds", context: "", rules: [], steps: [], escalationConditions: [], successConditions: [] },
      trigger: { type: "integration_event", event: "zendesk.ticket.created" },
      policy: refundPolicy(level),
      successCriteria: [],
      modelClass: "AGENT_MODEL",
      tools: REFUND_TOOLS,
    },
    process: { id: "proc_1", title: "Refund request handling", description: "", departmentId: null, estimatedMinutesPerOccurrence: 8 },
    organization: { id: "org_1", name: "Acme", description: null, industry: null, paused: false },
  };
  store.runs.set(ctx.run.id, ctx);
  return { store, runId: ctx.run.id, ticketId: String(ticket.id) };
}

export async function refunds(store: MemoryRunStore) {
  return store.sandbox().list("stripe", "refund").then((r) => r.filter((x) => x.idempotency_key));
}

export async function ticket(store: MemoryRunStore, id: string) {
  return store.sandbox().get("zendesk", "ticket", id);
}
