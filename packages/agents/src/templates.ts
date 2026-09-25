import type { PolicyConfig } from "@autonomos/schemas";

// Default policies by autonomy level for the refund template (PRD section 34).
export function refundPolicy(level: number): PolicyConfig {
  return {
    confidenceThreshold: 0.9,
    approvalRequiredFor: level <= 3 ? ["stripe.create_refund"] : [],
    amountThresholds: [{ tool: "stripe.create_refund", field: "amount", maxWithoutApproval: level >= 4 ? 100 : 0 }],
    hardLimits: [{ tool: "stripe.create_refund", field: "amount", max: 1000 }],
    conditions: [
      {
        tool: "stripe.create_refund",
        field: "customer_segment",
        operator: "equals",
        value: "enterprise",
        effect: "require_approval",
        label: "Enterprise customers require manager approval",
      },
    ],
    workingHours: null,
    maxActionsPerRun: 6,
    maxActionsPerDay: 200,
    maxStepsPerRun: 15,
  };
}

export function defaultPolicy(): PolicyConfig {
  return {
    confidenceThreshold: 0.9,
    approvalRequiredFor: [],
    amountThresholds: [],
    hardLimits: [],
    conditions: [],
    workingHours: null,
    maxActionsPerRun: 10,
    maxActionsPerDay: 200,
    maxStepsPerRun: 15,
  };
}

export function policyForTools(tools: string[], level: number): PolicyConfig {
  return tools.includes("stripe.create_refund") ? refundPolicy(level) : defaultPolicy();
}
