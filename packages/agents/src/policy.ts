import type { AutonomyLevel, ConditionRule, PolicyConfig } from "@autonomos/schemas";
import { checkWarehouseSql, getTool, isHighRisk, type ToolDefinition } from "@autonomos/integrations";

// Deterministic policy engine (PRD sections 63-65, 72, 91).
// Every write the agent proposes passes through evaluatePolicy before anything executes.
// The model's own decision and confidence can make an action stricter, never looser.

export type PolicyOutcome =
  | "allow" // execute now
  | "require_approval" // stop and ask a human
  | "draft" // Draft mode: record the proposal, a person performs the action
  | "simulate" // test run: show what would happen, execute nothing
  | "deny"; // never execute

export type PolicyCheck = { rule: string; passed: boolean; detail?: string; effect?: "require_approval" | "deny" };

export type PolicyEvaluation = {
  outcome: PolicyOutcome;
  // What would have happened outside of test mode; lets a test run list the approvals it would need.
  productionOutcome: Exclude<PolicyOutcome, "simulate">;
  checks: PolicyCheck[];
  reasons: string[];
};

export type PolicyContext = {
  mode: "test" | "production";
  autonomyLevel: AutonomyLevel;
  agentStatus: string;
  organizationPaused: boolean;
  allowedTools: string[];
  policy: PolicyConfig;
  modelConfidence?: number;
  modelRequestedApproval: boolean;
  actionsThisRun: number;
  actionsToday: number;
  now: Date;
};

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

function matchesTool(ruleTool: string, def: ToolDefinition) {
  return ruleTool === "*" || ruleTool === def.key || ruleTool === def.integration || ruleTool === `${def.integration}.*`;
}

function conditionHolds(rule: ConditionRule, args: Record<string, unknown>): boolean {
  const value = getPath(args, rule.field);
  switch (rule.operator) {
    case "equals":
      return value === rule.value;
    case "not_equals":
      return value !== rule.value;
    case "in":
      return Array.isArray(rule.value) && rule.value.includes(String(value));
    case "greater_than":
      return typeof value === "number" && typeof rule.value === "number" && value > rule.value;
    case "less_than":
      return typeof value === "number" && typeof rule.value === "number" && value < rule.value;
  }
}

function withinWorkingHours(hours: NonNullable<PolicyConfig["workingHours"]>, now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: hours.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const current = `${hh === "24" ? "00" : hh}:${mm}`;
  return hours.days.includes(day) && current >= hours.start && current < hours.end;
}

export function evaluatePolicy(toolKey: string, args: Record<string, unknown>, ctx: PolicyContext): PolicyEvaluation {
  const checks: PolicyCheck[] = [];
  const def = getTool(toolKey);

  const deny = (rule: string, detail: string) => checks.push({ rule, passed: false, detail, effect: "deny" });
  const needApproval = (rule: string, detail: string) => checks.push({ rule, passed: false, detail, effect: "require_approval" });
  const pass = (rule: string, detail?: string) => checks.push({ rule, passed: true, detail });

  // --- Hard gates: these deny regardless of approval ------------------------
  if (!def) {
    deny("Tool exists", `Unknown tool ${toolKey}`);
  } else {
    pass("Tool exists");
  }

  if (!ctx.allowedTools.includes(toolKey)) {
    deny("Tool is on the agent's allowlist", `${toolKey} is not allowed for this agent`);
  } else {
    pass("Tool is on the agent's allowlist");
  }

  if (ctx.organizationPaused) deny("Organisation agents are running", "All agents are paused by an admin");
  if (ctx.mode === "production" && ctx.agentStatus !== "active") {
    deny("Agent is active", `Agent status is ${ctx.agentStatus}; only active agents execute`);
  }
  if (ctx.autonomyLevel === 1) deny("The agent may act in this mode", "Manual: your team does this work");

  if (ctx.actionsThisRun >= ctx.policy.maxActionsPerRun) {
    deny("Maximum actions per run", `Limit of ${ctx.policy.maxActionsPerRun} reached`);
  } else {
    pass("Maximum actions per run", `${ctx.actionsThisRun + 1} of ${ctx.policy.maxActionsPerRun}`);
  }
  if (ctx.actionsToday >= ctx.policy.maxActionsPerDay) {
    deny("Maximum actions per day", `Limit of ${ctx.policy.maxActionsPerDay} reached`);
  } else {
    pass("Maximum actions per day");
  }

  for (const limit of ctx.policy.hardLimits) {
    if (!def || !matchesTool(limit.tool, def)) continue;
    const value = Number(getPath(args, limit.field));
    if (!Number.isFinite(value)) {
      deny(`Hard limit on ${limit.field}`, `${limit.field} is missing or not a number`);
    } else if (value > limit.max) {
      deny(`Hard limit on ${limit.field}`, `${value} exceeds the hard limit of ${limit.max}`);
    } else {
      pass(`Hard limit on ${limit.field}`, `${value} ≤ ${limit.max}`);
    }
  }

  // A warehouse query runs only inside the agent's allowed dataset, and only as one SELECT.
  if (toolKey === "warehouse.query") {
    const scope = (ctx.policy.dataScopes ?? []).find((s) => s.tool === toolKey);
    const rule = "Query stays inside the allowed dataset";
    if (!scope) {
      deny(rule, "No dataset is allowed for this agent");
    } else if (args.project_id !== scope.project || args.dataset !== scope.dataset) {
      deny(rule, `Only ${scope.project}.${scope.dataset} may be queried`);
    } else {
      const check = checkWarehouseSql(String(args.sql ?? ""), scope);
      if (check.ok) pass(rule, `${scope.project}.${scope.dataset}`);
      else deny(rule, check.reason);
    }
  }

  for (const rule of ctx.policy.conditions) {
    if (!def || !matchesTool(rule.tool, def)) continue;
    if (conditionHolds(rule, args)) {
      if (rule.effect === "deny") deny(rule.label, "Condition matched");
      else needApproval(rule.label, "Condition matched");
    } else {
      pass(rule.label);
    }
  }

  // --- Approval gates -------------------------------------------------------
  if (def) {
    const threshold = ctx.policy.amountThresholds.find((t) => matchesTool(t.tool, def));
    const explicitlyRequired = ctx.policy.approvalRequiredFor.some((k) => matchesTool(k, def));

    if (ctx.autonomyLevel === 3) {
      needApproval("Approve mode: every action needs approval", "The agent proposes, a person approves");
    }

    if (explicitlyRequired) needApproval("Approval required for this action", `Policy lists ${def.key}`);

    if (threshold) {
      const amount = Number(getPath(args, threshold.field));
      if (!Number.isFinite(amount)) {
        needApproval(`Amount within autonomous limit`, `${threshold.field} is missing`);
      } else if (amount > threshold.maxWithoutApproval) {
        needApproval("Amount within autonomous limit", `${amount} is above the limit of ${threshold.maxWithoutApproval}`);
      } else {
        pass("Amount within autonomous limit", `${amount} ≤ ${threshold.maxWithoutApproval}`);
      }
    } else if (isHighRisk(def)) {
      // High-risk actions need approval unless an explicit threshold rule covers them (PRD section 72).
      needApproval("High-risk action approval", `${def.label} requires approval by default`);
    }

    if (ctx.modelConfidence === undefined) {
      needApproval("Confidence reported", "The agent did not report confidence");
    } else if (ctx.modelConfidence < ctx.policy.confidenceThreshold) {
      needApproval(
        "Confidence above threshold",
        `${Math.round(ctx.modelConfidence * 100)}% is below ${Math.round(ctx.policy.confidenceThreshold * 100)}%`,
      );
    } else {
      pass("Confidence above threshold", `${Math.round(ctx.modelConfidence * 100)}%`);
    }

    if (ctx.modelRequestedApproval) needApproval("Agent asked for a human", "The agent requested approval");

    if (ctx.policy.workingHours) {
      if (withinWorkingHours(ctx.policy.workingHours, ctx.now)) pass("Within working hours");
      else needApproval("Within working hours", "Outside configured working hours");
    }
  }

  const denied = checks.filter((c) => c.effect === "deny");
  const approvals = checks.filter((c) => c.effect === "require_approval");

  let productionOutcome: PolicyEvaluation["productionOutcome"];
  if (denied.length) productionOutcome = "deny";
  else if (def?.access === "write" && ctx.autonomyLevel === 2) productionOutcome = "draft";
  else if (def?.access === "read") productionOutcome = "allow";
  else if (approvals.length) productionOutcome = "require_approval";
  else productionOutcome = "allow";

  // Reads are always safe to perform, including in test mode. Writes never execute in test mode.
  const outcome: PolicyOutcome =
    ctx.mode === "test" && def?.access === "write" && productionOutcome !== "deny" ? "simulate" : productionOutcome;

  return {
    outcome,
    productionOutcome,
    checks,
    reasons: [...denied, ...approvals].map((c) => `${c.rule}: ${c.detail ?? "failed"}`),
  };
}

// Re-check after a human approved or modified the action. Approval satisfies approval
// gates, but hard gates (allowlist, limits, emergency stop, deny conditions) still apply.
export function evaluateApprovedAction(toolKey: string, args: Record<string, unknown>, ctx: PolicyContext): PolicyEvaluation {
  const evaluation = evaluatePolicy(toolKey, args, { ...ctx, modelRequestedApproval: false });
  if (evaluation.productionOutcome === "require_approval") {
    return { ...evaluation, outcome: ctx.mode === "test" ? "simulate" : "allow", productionOutcome: "allow" };
  }
  return evaluation;
}
