import { z } from "zod";

export type RiskTag = "financial" | "outbound_message" | "deletion" | "bulk_outbound" | "customer_account" | "billing_change" | "sensitive_export" | "contract" | "employee";

// PRD section 72: these always require approval by default.
export const HIGH_RISK_TAGS: RiskTag[] = ["financial", "deletion", "contract", "employee", "bulk_outbound", "customer_account", "billing_change", "sensitive_export"];

export type ToolDefinition<I extends z.ZodType = z.ZodType> = {
  key: string;
  integration: string;
  // Customer-facing wording ("What the agent can do"), PRD section 112.
  label: string;
  description: string;
  access: "read" | "write";
  riskTags: RiskTag[];
  reversible: boolean;
  input: I;
  // Fields a human may change when approving with modifications (PRD section 44).
  modifiableFields: string[];
  // Human-readable question for the approval card.
  approvalTitle?: (args: z.infer<I>) => string;
  // Field that carries a monetary amount, for threshold policies.
  amountField?: string;
  // Tools loaded from Composio carry the toolkit's own JSON schema, shown to the model as is.
  source?: "builtin" | "composio";
  jsonSchema?: Record<string, unknown>;
  // The Composio toolkit version the tool was listed with, so runs use the schema the agent was built on.
  version?: string;
};

function tool<I extends z.ZodType>(def: ToolDefinition<I>): ToolDefinition<I> {
  return def;
}

const money = (amount: number, currency: string) => new Intl.NumberFormat("en-IE", { style: "currency", currency: currency.toUpperCase() }).format(amount);

export const TOOLS = [
  tool({
    key: "zendesk.read_ticket",
    integration: "zendesk",
    label: "Read support tickets",
    description: "Read a Zendesk ticket including requester, subject, description and comments.",
    access: "read",
    riskTags: [],
    reversible: true,
    input: z.object({ ticket_id: z.string() }),
    modifiableFields: [],
  }),
  tool({
    key: "zendesk.send_reply",
    integration: "zendesk",
    label: "Reply to customers on tickets",
    description: "Add a public reply (or internal note when public is false) to a Zendesk ticket.",
    access: "write",
    riskTags: ["outbound_message"],
    reversible: false,
    input: z.object({ ticket_id: z.string(), body: z.string().min(1), public: z.boolean().default(true) }),
    modifiableFields: ["body"],
    approvalTitle: (a) => `Send reply on ticket #${a.ticket_id}?`,
  }),
  tool({
    key: "zendesk.update_ticket",
    integration: "zendesk",
    label: "Update ticket status and tags",
    description: "Set the status (open, pending, solved) and add tags on a Zendesk ticket.",
    access: "write",
    riskTags: [],
    reversible: true,
    input: z.object({
      ticket_id: z.string(),
      status: z.enum(["open", "pending", "solved"]).optional(),
      add_tags: z.array(z.string()).default([]),
    }),
    modifiableFields: ["status"],
    approvalTitle: (a) => `Update ticket #${a.ticket_id}${a.status ? ` to ${a.status}` : ""}?`,
  }),
  tool({
    key: "stripe.find_customer",
    integration: "stripe",
    label: "Look up customers",
    description: "Find a Stripe customer by email address.",
    access: "read",
    riskTags: [],
    reversible: true,
    input: z.object({ email: z.string().email() }),
    modifiableFields: [],
  }),
  tool({
    key: "stripe.list_payments",
    integration: "stripe",
    label: "Read payments",
    description: "List recent payments for a Stripe customer. Amounts are in major currency units.",
    access: "read",
    riskTags: [],
    reversible: true,
    input: z.object({ customer_id: z.string(), limit: z.number().int().min(1).max(50).default(10) }),
    modifiableFields: [],
  }),
  tool({
    key: "stripe.get_payment",
    integration: "stripe",
    label: "Read payments",
    description: "Get one Stripe payment by id, including how much has already been refunded.",
    access: "read",
    riskTags: [],
    reversible: true,
    input: z.object({ payment_id: z.string() }),
    modifiableFields: [],
  }),
  tool({
    key: "stripe.list_refunds",
    integration: "stripe",
    label: "Read refunds",
    description: "List refunds previously issued to a Stripe customer.",
    access: "read",
    riskTags: [],
    reversible: true,
    input: z.object({ customer_id: z.string() }),
    modifiableFields: [],
  }),
  tool({
    key: "stripe.create_refund",
    integration: "stripe",
    label: "Create refunds",
    description: "Refund all or part of a Stripe payment. amount is in major currency units, for example 72.00.",
    access: "write",
    riskTags: ["financial"],
    reversible: false,
    input: z.object({
      payment_id: z.string(),
      amount: z.number().positive(),
      currency: z.string().length(3),
      reason: z.enum(["requested_by_customer", "duplicate", "fraudulent"]).default("requested_by_customer"),
      customer_id: z.string().optional(),
      customer_segment: z.string().optional(),
    }),
    modifiableFields: ["amount"],
    amountField: "amount",
    approvalTitle: (a) => `Refund ${money(a.amount, a.currency)} to customer?`,
  }),
  tool({
    key: "slack.post_message",
    integration: "slack",
    label: "Post messages to Slack channels",
    description: "Post a message to a Slack channel.",
    access: "write",
    riskTags: ["outbound_message"],
    reversible: false,
    input: z.object({ channel: z.string(), text: z.string().min(1) }),
    modifiableFields: ["text"],
    approvalTitle: (a) => `Post to ${a.channel}?`,
  }),
  tool({
    key: "gmail.send_email",
    integration: "gmail",
    label: "Send email",
    description: "Send an email to one recipient.",
    access: "write",
    riskTags: ["outbound_message"],
    reversible: false,
    input: z.object({ to: z.string().email(), subject: z.string().min(1), body: z.string().min(1) }),
    modifiableFields: ["subject", "body"],
    approvalTitle: (a) => `Email ${a.to}?`,
  }),
  tool({
    key: "knowledge.search_documents",
    integration: "knowledge",
    label: "Search company knowledge",
    description: "Search the company's knowledge (its website, help centre, policies and documents) for the passages that answer a question, for example the refund window or how to reply to a complaint.",
    access: "read",
    riskTags: [],
    reversible: true,
    input: z.object({ query: z.string().min(2) }),
    modifiableFields: [],
  }),
  // A read-only SELECT inside one dataset of a data warehouse, for steps where the warehouse
  // stands in for a CRM or another system (see warehouse.ts). The policy engine denies any query
  // outside the agent's allowed dataset or that is not a single SELECT.
  tool({
    key: "warehouse.query",
    integration: "googlebigquery",
    label: "Look up records in the data warehouse",
    description:
      "Run one read-only SQL SELECT in the allowed BigQuery dataset, for example to find a customer by email. Name tables as dataset.table. At most 50 rows come back; filter and select only the columns you need.",
    access: "read",
    riskTags: [],
    reversible: true,
    input: z.object({ project_id: z.string().min(1), dataset: z.string().min(1), sql: z.string().min(8), location: z.string().optional() }),
    modifiableFields: [],
  }),
] as const;

export type ToolKey = (typeof TOOLS)[number]["key"];

const BY_KEY = new Map<string, ToolDefinition>(TOOLS.map((t) => [t.key, t as unknown as ToolDefinition]));

// Tools loaded from Composio at runtime (see composio-tools.ts), keyed "composio:<SLUG>". They are
// registered from each agent version's stored snapshot before use, so a version always runs with
// the tool definition it was built with.
const DYNAMIC = new Map<string, ToolDefinition>();

export const isComposioTool = (key: string) => key.startsWith("composio:");

export function registerTool(def: ToolDefinition) {
  if (!BY_KEY.has(def.key)) DYNAMIC.set(def.key, def);
}

export function getTool(key: string): ToolDefinition | undefined {
  return BY_KEY.get(key) ?? DYNAMIC.get(key) ?? (isComposioTool(key) ? unknownComposioTool(key) : undefined);
}

// A Composio tool whose snapshot is not loaded in this process: treated as a write with no known
// risk, the most conservative reading, until the real definition is registered.
function unknownComposioTool(key: string): ToolDefinition {
  const slug = key.slice("composio:".length);
  const words = slug.split("_");
  return {
    key,
    integration: (words[0] ?? "").toLowerCase(),
    label:
      words
        .slice(1)
        .join(" ")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase()) || slug,
    description: slug,
    access: "write",
    riskTags: [],
    reversible: false,
    input: z.record(z.string(), z.unknown()),
    modifiableFields: [],
    source: "composio",
  };
}

// The built-in tools for these integrations (Composio tools come from composioToolsFor).
export function toolsForIntegrations(connected: string[]): ToolDefinition[] {
  const set = new Set([...connected, "knowledge"]);
  return TOOLS.filter((t) => set.has(t.integration)) as unknown as ToolDefinition[];
}

// Integrations whose built-in tools replace their Composio actions. A data warehouse's guarded
// query tool is added to its Composio actions instead of replacing them.
const ADDITIVE = new Set(["googlebigquery"]);
export const BUILTIN_INTEGRATIONS = new Set(TOOLS.map((t) => t.integration).filter((i) => !ADDITIVE.has(i)));

export function isHighRisk(def: ToolDefinition): boolean {
  return def.riskTags.some((t) => HIGH_RISK_TAGS.includes(t));
}
