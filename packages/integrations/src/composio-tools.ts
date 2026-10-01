import { z } from "zod";
import { toolkitFor } from "./directory";
import { composioConfigured, getComposio, LEGACY_TOOLKIT_VERSION } from "./providers";
import { registerTool, type RiskTag, type ToolDefinition } from "./tools";

// Every third-party system an agent works in goes through Composio. For the few systems with a
// built-in tool set (Zendesk, Stripe, Slack, Gmail) those tools map onto Composio actions; every
// other connected toolkit offers its own Composio actions directly, keyed "composio:<SLUG>".
//
// A tool's definition is stored with each agent version that uses it (a snapshot), so a version
// always runs with the definition it was built and tested with, even if Composio changes it.

export type ToolSnapshot = {
  key: string;
  integration: string;
  label: string;
  description: string;
  access: "read" | "write";
  riskTags: RiskTag[];
  reversible: boolean;
  jsonSchema: Record<string, unknown>;
  amountField?: string;
  // Toolkit version the tool was listed with; absent in snapshots stored before versions were kept.
  version?: string;
};

type RawComposioTool = {
  slug: string;
  name?: string;
  description?: string;
  tags?: string[];
  inputParameters?: { properties?: Record<string, { type?: string }>; required?: string[] } & Record<string, unknown>;
  isDeprecated?: boolean;
  version?: string;
};

// Risk from what the action does. Composio's own hints decide read or write and deletion; the
// action name adds the rest. Anything that moves money, messages people or signs is high risk.
const RISK_PATTERNS: Array<[RiskTag, RegExp]> = [
  ["financial", /(PAYMENT|REFUND|CHARGE|INVOICE|PAYOUT|TRANSFER|TRANSACTION|BILL|CREDIT_NOTE|JOURNAL|SUBSCRIPTION|PRICE|EXPENSE)/],
  ["outbound_message", /(SEND|EMAIL|MESSAGE|POST_|REPLY|COMMENT|NOTIFY|SMS|TWEET|PUBLISH)/],
  ["contract", /(CONTRACT|ENVELOPE|SIGNATURE|AGREEMENT)/],
  ["employee", /(EMPLOYEE|PAYROLL|HIRE|CANDIDATE|TIME_OFF|LEAVE)/],
  ["bulk_outbound", /(BATCH|BULK|CAMPAIGN)/],
  ["customer_account", /(CUSTOMER|CONTACT|ACCOUNT|USER)/],
  ["sensitive_export", /(EXPORT|DOWNLOAD)/],
];

export function snapshotFromComposio(raw: RawComposioTool, integration: string): ToolSnapshot {
  const tags = new Set(raw.tags ?? []);
  const read = tags.has("readOnlyHint");
  const destructive = tags.has("destructiveHint");
  const riskTags: RiskTag[] = read ? [] : [...(destructive ? (["deletion"] as RiskTag[]) : []), ...RISK_PATTERNS.filter(([, re]) => re.test(raw.slug)).map(([t]) => t)];
  const props = raw.inputParameters?.properties ?? {};
  const amountField = Object.keys(props).find((k) => /^(amount|total|unit_amount|value)$/i.test(k) && ["number", "integer"].includes(props[k]?.type ?? ""));
  return {
    key: `composio:${raw.slug}`,
    integration,
    label: raw.name?.trim() || raw.slug,
    description: (raw.description ?? raw.name ?? raw.slug).slice(0, 600),
    access: read ? "read" : "write",
    riskTags: [...new Set(riskTags)],
    reversible: read || (!destructive && !riskTags.some((t) => t === "outbound_message" || t === "financial" || t === "contract")),
    jsonSchema: (raw.inputParameters ?? { type: "object", properties: {} }) as Record<string, unknown>,
    ...(amountField && !read ? { amountField } : {}),
    ...(raw.version && raw.version !== LEGACY_TOOLKIT_VERSION ? { version: raw.version } : {}),
  };
}

// A snapshot as a tool definition the engine and policy use. Arguments are checked for the
// required fields; the rest of the shape is the toolkit's to validate.
export function definitionFromSnapshot(s: ToolSnapshot): ToolDefinition {
  const required = ((s.jsonSchema.required as string[] | undefined) ?? []).filter((r) => typeof r === "string");
  const input = z.record(z.string(), z.unknown()).superRefine((v, ctx) => {
    for (const r of required) if (v[r] === undefined || v[r] === null || v[r] === "") ctx.addIssue({ code: "custom", message: `${r} is required`, path: [r] });
  });
  return {
    key: s.key,
    integration: s.integration,
    label: s.label,
    description: s.description,
    access: s.access,
    riskTags: s.riskTags,
    reversible: s.reversible,
    input,
    modifiableFields: [],
    ...(s.amountField ? { amountField: s.amountField } : {}),
    source: "composio",
    jsonSchema: s.jsonSchema,
    ...(s.version ? { version: s.version } : {}),
  };
}

// Makes stored snapshots available to getTool in this process (run engine, pages, policy).
export function registerSnapshots(snapshots: Array<ToolSnapshot | null | undefined>) {
  for (const s of snapshots) if (s && s.key) registerTool(definitionFromSnapshot(s));
}

// The snapshot to store for a tool, if it is a Composio tool registered in this process.
export function snapshotOf(def: ToolDefinition | undefined): ToolSnapshot | null {
  if (!def || def.source !== "composio" || !def.jsonSchema) return null;
  return {
    key: def.key,
    integration: def.integration,
    label: def.label,
    description: def.description,
    access: def.access,
    riskTags: def.riskTags,
    reversible: def.reversible,
    jsonSchema: def.jsonSchema,
    ...(def.amountField ? { amountField: def.amountField } : {}),
    ...(def.version ? { version: def.version } : {}),
  };
}

// The actions a connected toolkit offers agents: Composio's curated "important" set, which keeps
// the choice short (large toolkits have hundreds). Cached per toolkit for an hour.
const cache = new Map<string, { at: number; tools: ToolDefinition[] }>();
const TTL = 3_600_000;

export async function composioToolsFor(integration: string): Promise<ToolDefinition[]> {
  if (!composioConfigured()) return [];
  const hit = cache.get(integration);
  if (hit && Date.now() - hit.at < TTL) return hit.tools;
  const toolkit = toolkitFor(integration);
  const composio = getComposio();
  let raw = (await composio.tools.getRawComposioTools({ toolkits: [toolkit], important: true } as never)) as unknown as RawComposioTool[];
  if (!raw.length) raw = (await composio.tools.getRawComposioTools({ toolkits: [toolkit], limit: 25 } as never)) as unknown as RawComposioTool[];
  const tools = raw.filter((t) => !t.isDeprecated).map((t) => definitionFromSnapshot(snapshotFromComposio(t, integration)));
  for (const t of tools) registerTool(t);
  cache.set(integration, { at: Date.now(), tools });
  return tools;
}
