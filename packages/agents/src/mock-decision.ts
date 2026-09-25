import type { AgentDecision } from "@autonomos/schemas";
import type { Observation, RunContext, RunState } from "./store";

// Deterministic stand-in for the agent model, used only in mock mode (no model key).
// It follows the refund template's operating procedure so the whole product loop,
// including approvals and policy enforcement, can be exercised offline.

type Result = Extract<Observation, { kind: "tool_result" }>;

const lastResult = (obs: Observation[], tool: string) =>
  [...obs].reverse().find((o): o is Result => o.kind === "tool_result" && o.tool === tool);
const hasError = (obs: Observation[], tool: string) => obs.some((o) => o.kind === "tool_error" && o.tool === tool);
const humanDecision = (obs: Observation[], tool: string) =>
  [...obs].reverse().find((o): o is Extract<Observation, { kind: "human" }> => o.kind === "human" && o.tool === tool);
const drafted = (obs: Observation[], tool: string) => obs.some((o) => o.kind === "draft" && o.tool === tool);

const INJECTION = /(ignore (your|all|previous)|system override|without approval|you are now|disregard)/i;

function stop(summary: string, result: string, success: boolean): AgentDecision {
  return { summary, decision: "stop", reasoningSummary: result, policyChecks: [], confidence: 0.95, outcome: { result, success } };
}
function escalate(summary: string, reason: string): AgentDecision {
  return { summary, decision: "escalate", reasoningSummary: reason, policyChecks: [], confidence: 0.9, outcome: { result: reason, success: false } };
}
function read(summary: string, tool: string, args: Record<string, unknown>): AgentDecision {
  return { summary, decision: "continue", reasoningSummary: summary, proposedTool: tool, proposedArguments: args, policyChecks: [], confidence: 0.97 };
}

export function mockDecision(ctx: RunContext, state: RunState): AgentDecision {
  const tools = new Set(ctx.version.tools);
  const obs = state.observations;
  const trigger = (obs.find((o) => o.kind === "trigger") as Extract<Observation, { kind: "trigger" }> | undefined)?.input ?? {};

  if (!tools.has("zendesk.read_ticket") || !tools.has("stripe.create_refund")) {
    return genericDecision(ctx, state);
  }

  const ticketId = String(trigger.ticket_id ?? "");
  if (!ticketId) return escalate("No ticket in the trigger", "The run was started without a ticket id");

  const ticketObs = lastResult(obs, "zendesk.read_ticket");
  if (!ticketObs) {
    if (hasError(obs, "zendesk.read_ticket")) return escalate("Ticket could not be read", `Ticket ${ticketId} could not be read`);
    return read(`Read ticket #${ticketId}`, "zendesk.read_ticket", { ticket_id: ticketId });
  }
  const ticket = ticketObs.result as { requester_email?: string; description?: string; subject?: string };
  const text = `${ticket.subject ?? ""} ${ticket.description ?? ""}`;
  if (INJECTION.test(text)) {
    return escalate("Suspicious instructions in ticket", "The ticket contains instructions aimed at the agent. Handing to a human instead of acting on it.");
  }

  const customerObs = lastResult(obs, "stripe.find_customer");
  if (!customerObs && tools.has("stripe.find_customer")) {
    if (!ticket.requester_email) return escalate("Requester email missing", "Customer cannot be identified: the ticket has no requester email");
    return read(`Look up ${ticket.requester_email} in Stripe`, "stripe.find_customer", { email: ticket.requester_email });
  }
  const customerResult = customerObs?.result as { found?: boolean; customer?: { id: string; segment?: string } } | undefined;
  if (!customerResult?.found || !customerResult.customer) return escalate("Customer not found", "Customer cannot be found in Stripe");
  const customer = customerResult.customer;

  const paymentsObs = lastResult(obs, "stripe.list_payments");
  if (!paymentsObs && tools.has("stripe.list_payments")) {
    return read("Find the customer's recent payments", "stripe.list_payments", { customer_id: customer.id, limit: 10 });
  }
  const payments = ((paymentsObs?.result as { payments?: Array<Record<string, unknown>> } | undefined)?.payments ?? []) as Array<{
    id: string;
    amount: number;
    currency: string;
    created_at: string;
    refunded_amount?: number;
  }>;

  const refundsObs = lastResult(obs, "stripe.list_refunds");
  if (!refundsObs && tools.has("stripe.list_refunds")) {
    return read("Check previous refunds", "stripe.list_refunds", { customer_id: customer.id });
  }
  const refunds = ((refundsObs?.result as { refunds?: Array<{ created_at: string; amount: number }> } | undefined)?.refunds ?? []);

  const mentioned = Number((text.match(/€\s?(\d+(?:[.,]\d{1,2})?)/)?.[1] ?? "").replace(",", "."));
  const now = Date.now();
  const payment =
    payments.find((p) => Number.isFinite(mentioned) && mentioned > 0 && Math.abs(p.amount - mentioned) < 0.01) ??
    payments.find((p) => (p.refunded_amount ?? 0) < p.amount);
  if (!payment) return escalate("Payment not found", "No refundable payment could be matched to the request");

  const ageDays = (now - new Date(payment.created_at).getTime()) / 86_400_000;
  const refundable = payment.amount - (payment.refunded_amount ?? 0);
  const recentRefunds = refunds.filter((r) => now - new Date(r.created_at).getTime() < 90 * 86_400_000);
  const checks = [
    { rule: "Payment is within 14 days", passed: ageDays <= 14 },
    { rule: "Amount has not already been refunded", passed: refundable > 0 },
    { rule: "No refund in the last 90 days", passed: recentRefunds.length === 0 },
  ];

  const refundResult = lastResult(obs, "stripe.create_refund");
  const refundHuman = humanDecision(obs, "stripe.create_refund");
  const refundFailed = hasError(obs, "stripe.create_refund");
  const refundDrafted = drafted(obs, "stripe.create_refund");

  if (!refundResult && !refundHuman && !refundFailed && !refundDrafted) {
    if (ageDays > 14) {
      if (!lastResult(obs, "zendesk.send_reply") && tools.has("zendesk.send_reply")) {
        return {
          summary: "Decline: outside the 14 day refund window",
          decision: "execute",
          reasoningSummary: `Payment ${payment.id} is ${Math.round(ageDays)} days old, outside the 14 day refund window.`,
          proposedTool: "zendesk.send_reply",
          proposedArguments: {
            ticket_id: ticketId,
            public: true,
            body: "Thanks for getting in touch. This payment is outside our 14 day refund window, so we can't refund it automatically. A member of our team will review your request and follow up.",
          },
          policyChecks: checks,
          confidence: 0.92,
        };
      }
      return stop("Request declined", "Refund declined: outside the refund window", true);
    }
    const confidence = recentRefunds.length ? 0.72 : 0.94;
    return {
      summary: `Propose refund of ${refundable} ${payment.currency.toUpperCase()} for payment ${payment.id}`,
      decision: recentRefunds.length ? "request_approval" : "execute",
      reasoningSummary: recentRefunds.length
        ? `Payment is ${Math.round(ageDays)} days old and refundable, but the customer had a refund in the last 90 days, so a human should decide.`
        : `Customer requested a refund ${Math.round(ageDays)} days after paying. The payment is within the 14 day window and has not been refunded before.`,
      proposedTool: "stripe.create_refund",
      proposedArguments: {
        payment_id: payment.id,
        amount: refundable,
        currency: payment.currency,
        reason: "requested_by_customer",
        customer_id: customer.id,
        customer_segment: customer.segment ?? "standard",
      },
      evidence: [
        { source: "Zendesk", description: `Ticket #${ticketId}: "${ticket.subject ?? ""}"` },
        { source: "Stripe", description: `Payment ${payment.id}: ${payment.amount} ${payment.currency.toUpperCase()} on ${payment.created_at.slice(0, 10)}` },
        { source: "Stripe", description: `${recentRefunds.length} refund(s) in the last 90 days` },
      ],
      policyChecks: checks,
      confidence,
    };
  }

  const refunded = Boolean(refundResult);
  const rejected = refundHuman?.decision === "rejected";

  if (!lastResult(obs, "zendesk.send_reply") && !drafted(obs, "zendesk.send_reply") && tools.has("zendesk.send_reply")) {
    const amount = refundResult ? Number((refundResult.args as { amount?: number }).amount) : refundable;
    const body = refunded
      ? `Good news: we've refunded ${new Intl.NumberFormat("en-IE", { style: "currency", currency: payment.currency.toUpperCase() }).format(amount)} to your original payment method. It usually appears within 5 to 10 business days.`
      : rejected
        ? "Thanks for your patience. A member of our team has reviewed your request and will follow up with you directly."
        : "Thanks for getting in touch. We've passed your refund request to our team and will follow up shortly.";
    return {
      summary: refunded ? "Reply to confirm the refund" : "Reply to update the customer",
      decision: "execute",
      reasoningSummary: refunded ? "Refund succeeded, confirming to the customer." : "Refund was not issued, letting the customer know a human will follow up.",
      proposedTool: "zendesk.send_reply",
      proposedArguments: { ticket_id: ticketId, body, public: true },
      policyChecks: checks,
      confidence: 0.95,
    };
  }

  if (!lastResult(obs, "zendesk.update_ticket") && !drafted(obs, "zendesk.update_ticket") && tools.has("zendesk.update_ticket")) {
    return {
      summary: refunded ? "Mark the ticket solved" : "Mark the ticket pending for the team",
      decision: "execute",
      reasoningSummary: "Updating the ticket status to reflect the outcome.",
      proposedTool: "zendesk.update_ticket",
      proposedArguments: { ticket_id: ticketId, status: refunded ? "solved" : "pending", add_tags: [refunded ? "refund_issued" : "refund_needs_review"] },
      policyChecks: checks,
      confidence: 0.96,
    };
  }

  if (refunded) return stop("Refund completed", `Refunded payment ${payment.id} and closed ticket #${ticketId}`, true);
  if (rejected) return stop("Refund rejected by a human", `Refund rejected by a human; customer informed on ticket #${ticketId}`, false);
  if (refundDrafted) return stop("Refund drafted", `Refund drafted for a human to issue on ticket #${ticketId}`, true);
  return escalate("Refund could not be issued", "The refund failed; a human needs to complete it");
}

function genericDecision(ctx: RunContext, state: RunState): AgentDecision {
  const reads = ctx.version.tools.filter((t) => t === "knowledge.search_documents");
  if (reads.length && !state.observations.some((o) => o.kind === "tool_result")) {
    return read("Search company documents for context", "knowledge.search_documents", { query: ctx.process.title });
  }
  return stop(
    "Prepared the result for review",
    `Gathered context for "${ctx.process.title}". Mock mode has no scripted behaviour for this agent, so it stops here. Configure a model key for real execution.`,
    true,
  );
}
