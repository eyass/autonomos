import { modeOf } from "@autonomos/schemas";
import { getTool } from "@autonomos/integrations";

type Json = Record<string, unknown>;
export type VersionSnapshot = { autonomy_level: number; instructions: Json; trigger_config: Json; policy_config: Json; tools: string[] };

const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map((x) => (typeof x === "string" ? x : JSON.stringify(x))) : []);
const toolName = (k: string) => getTool(k)?.label ?? k;

function listChange(label: string, before: unknown, after: unknown, name: (s: string) => string = (s) => s) {
  const a = list(before);
  const b = list(after);
  const added = b.filter((x) => !a.includes(x));
  const removed = a.filter((x) => !b.includes(x));
  const out: string[] = [];
  if (added.length) out.push(`${label} added: ${added.map(name).join("; ")}`);
  if (removed.length) out.push(`${label} removed: ${removed.map(name).join("; ")}`);
  return out;
}

function triggerText(t: Json) {
  if (t.type === "schedule") return `schedule ${t.cron} (${t.timezone})`;
  if (t.type === "integration_event") return `event ${t.event}`;
  return "manual";
}

// Human-readable differences between two configuration versions, newest second.
export function diffVersions(prev: VersionSnapshot, next: VersionSnapshot): string[] {
  const out: string[] = [];
  if (prev.autonomy_level !== next.autonomy_level) out.push(`Mode ${modeOf(prev.autonomy_level).name} → ${modeOf(next.autonomy_level).name}`);
  if (triggerText(prev.trigger_config) !== triggerText(next.trigger_config)) out.push(`Trigger ${triggerText(prev.trigger_config)} → ${triggerText(next.trigger_config)}`);
  out.push(...listChange("Tools", prev.tools, next.tools, toolName));
  const pi = prev.instructions;
  const ni = next.instructions;
  if (pi.objective !== ni.objective) out.push("Objective rewritten");
  if (pi.context !== ni.context) out.push("Context rewritten");
  out.push(...listChange("Rule", pi.rules, ni.rules));
  out.push(...listChange("Escalation", pi.escalationConditions, ni.escalationConditions));
  if (JSON.stringify(pi.steps) !== JSON.stringify(ni.steps)) out.push("Steps changed");
  const pp = prev.policy_config;
  const np = next.policy_config;
  if (pp.confidenceThreshold !== np.confidenceThreshold) out.push(`Confidence threshold ${Math.round(Number(pp.confidenceThreshold) * 100)}% → ${Math.round(Number(np.confidenceThreshold) * 100)}%`);
  out.push(...listChange("Always ask before", pp.approvalRequiredFor, np.approvalRequiredFor, toolName));
  if (JSON.stringify(pp.amountThresholds) !== JSON.stringify(np.amountThresholds)) out.push("Amount limits changed");
  if (JSON.stringify(pp.hardLimits) !== JSON.stringify(np.hardLimits)) out.push("Hard limits changed");
  if (pp.maxActionsPerRun !== np.maxActionsPerRun || pp.maxActionsPerDay !== np.maxActionsPerDay) out.push("Action limits changed");
  return out;
}
