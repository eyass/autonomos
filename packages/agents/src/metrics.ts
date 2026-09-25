import { AUTONOMY_COEFFICIENTS, type AutonomyLevel } from "@autonomos/schemas";
import { monthlyMinutes } from "./scoring";

export type ProcessForMetrics = {
  id: string;
  departmentId: string | null;
  status: string;
  currentAutonomyLevel: AutonomyLevel;
  estimatedOccurrencesPerMonth: number | null;
  estimatedMinutesPerOccurrence: number | null;
};

// A process runs at the autonomy of its best active agent, or its recorded level if higher.
export function effectiveAutonomy(p: ProcessForMetrics, activeAgentLevels: Map<string, number>): AutonomyLevel {
  const agent = activeAgentLevels.get(p.id) ?? 1;
  return Math.max(p.currentAutonomyLevel, agent) as AutonomyLevel;
}

// PRD section 49: Σ(monthly time × coefficient) / Σ(monthly time).
export function autonomyScore(processes: ProcessForMetrics[], activeAgentLevels: Map<string, number>): number | null {
  const tracked = processes.filter((p) => p.status !== "archived" && monthlyMinutes(p) > 0);
  const total = tracked.reduce((s, p) => s + monthlyMinutes(p), 0);
  if (!total) return null;
  const weighted = tracked.reduce((s, p) => s + monthlyMinutes(p) * AUTONOMY_COEFFICIENTS[effectiveAutonomy(p, activeAgentLevels)], 0);
  return weighted / total;
}

export function departmentAutonomy(processes: ProcessForMetrics[], activeAgentLevels: Map<string, number>) {
  const groups = new Map<string, ProcessForMetrics[]>();
  for (const p of processes) {
    const key = p.departmentId ?? "none";
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()].map(([departmentId, list]) => ({
    departmentId: departmentId === "none" ? null : departmentId,
    score: autonomyScore(list, activeAgentLevels),
    monthlyMinutes: list.reduce((s, p) => s + monthlyMinutes(p), 0),
    processes: list.length,
  }));
}

export type RunForStats = {
  mode: "test" | "production";
  status: string;
  outcome: string | null;
  success: boolean | null;
  modelCost: number;
  estimatedMinutesSaved: number | null;
  hadIntervention: boolean;
};

export type ApprovalForStats = { status: string };

export function agentStats(runs: RunForStats[], approvals: ApprovalForStats[], hourlyCost: number) {
  const prod = runs.filter((r) => r.mode === "production");
  const finished = prod.filter((r) => ["completed", "failed", "cancelled"].includes(r.status));
  const completedOk = finished.filter((r) => r.success);
  const failed = finished.filter((r) => r.status === "failed");
  const intervened = finished.filter((r) => r.hadIntervention);
  const resolved = approvals.filter((a) => a.status !== "pending");
  const acceptedUnmodified = resolved.filter((a) => a.status === "approved");
  const minutesSaved = prod.reduce((s, r) => s + (r.estimatedMinutesSaved ?? 0), 0);
  const cost = runs.reduce((s, r) => s + r.modelCost, 0);
  const rate = (n: number, d: number) => (d ? n / d : null);
  return {
    runs: prod.length,
    testRuns: runs.length - prod.length,
    successRate: rate(completedOk.length, finished.length),
    completionRate: rate(finished.filter((r) => r.status === "completed").length, finished.length),
    failureRate: rate(failed.length, finished.length),
    humanInterventionRate: rate(intervened.length, finished.length),
    automationRate: rate(finished.filter((r) => r.success && !r.hadIntervention).length, finished.length),
    approvalAcceptanceRate: rate(acceptedUnmodified.length, resolved.length),
    approvalsResolved: resolved.length,
    hoursSaved: minutesSaved / 60,
    estimatedValue: (minutesSaved / 60) * hourlyCost,
    aiCost: cost,
  };
}

export type AutonomyRecommendation = {
  direction: "increase" | "decrease";
  from: number;
  to: number;
  message: string;
  evidence: string[];
};

// PRD sections 89-90: recommend, never change automatically.
export function autonomyRecommendation(level: number, stats: ReturnType<typeof agentStats>, agentName: string): AutonomyRecommendation | null {
  const pct = (n: number | null) => `${Math.round((n ?? 0) * 1000) / 10}%`;
  if (level >= 3 && stats.runs >= 5 && ((stats.failureRate ?? 0) > 0.15 || (stats.approvalAcceptanceRate ?? 1) < 0.7)) {
    return {
      direction: "decrease",
      from: level,
      to: level - 1,
      message: `${agentName} is making more mistakes than expected. Consider moving it from L${level} to L${level - 1} or pausing it.`,
      evidence: [`Failure rate ${pct(stats.failureRate)}`, `Approvals accepted unchanged ${pct(stats.approvalAcceptanceRate)}`],
    };
  }
  if (level === 3 && stats.approvalsResolved >= 20 && (stats.approvalAcceptanceRate ?? 0) >= 0.95 && (stats.failureRate ?? 0) <= 0.02) {
    return {
      direction: "increase",
      from: 3,
      to: 4,
      message: `${agentName} has had ${stats.approvalsResolved} approvals and ${pct(stats.approvalAcceptanceRate)} were approved without changes. Consider moving it from L3 to L4 for low-value actions.`,
      evidence: [`${stats.runs} production runs`, `Failure rate ${pct(stats.failureRate)}`],
    };
  }
  if (level === 4 && stats.runs >= 100 && (stats.humanInterventionRate ?? 1) <= 0.02 && (stats.failureRate ?? 1) <= 0.01) {
    return {
      direction: "increase",
      from: 4,
      to: 5,
      message: `${agentName} rarely needs a human. Consider L5 with the same limits.`,
      evidence: [`Intervention rate ${pct(stats.humanInterventionRate)}`],
    };
  }
  return null;
}
