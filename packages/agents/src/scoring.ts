import { AUTONOMY_COEFFICIENTS, type AutonomyLevel } from "@autonomos/schemas";

// PRD sections 26-27. Deterministic scores are blended with the model's estimate so a
// single model opinion can never set a score on its own.

const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n)));

export type ProcessSignals = {
  estimatedOccurrencesPerMonth?: number | null;
  estimatedMinutesPerOccurrence?: number | null;
  hourlyCost: number;
  systemsCount: number;
  stepsCount: number;
  judgementSteps: number;
  riskySteps: number;
  handlesMoney: boolean;
  customerFacing: boolean;
};

export function monthlyMinutes(p: { estimatedOccurrencesPerMonth?: number | null; estimatedMinutesPerOccurrence?: number | null }) {
  return (Number(p.estimatedOccurrencesPerMonth) || 0) * (Number(p.estimatedMinutesPerOccurrence) || 0);
}

export function deterministicBusinessValue(s: ProcessSignals): number {
  const hours = monthlyMinutes(s) / 60;
  const cost = hours * s.hourlyCost;
  let score = hours >= 60 ? 5 : hours >= 25 ? 4 : hours >= 10 ? 3 : hours >= 3 ? 2 : 1;
  if (s.customerFacing) score += 0.5;
  if (cost >= 2500) score += 0.5;
  return clamp(score);
}

export function deterministicDifficulty(s: ProcessSignals): number {
  let score = 1;
  score += Math.min(s.systemsCount, 4) * 0.5;
  score += s.stepsCount > 8 ? 1 : s.stepsCount > 5 ? 0.5 : 0;
  score += s.stepsCount ? (s.judgementSteps / s.stepsCount) * 2 : 1;
  return clamp(score);
}

export function deterministicRisk(s: ProcessSignals): number {
  let score = 1;
  if (s.handlesMoney) score += 2;
  if (s.customerFacing) score += 1;
  score += Math.min(s.riskySteps, 2) * 0.5;
  return clamp(score);
}

export function blendScore(deterministic: number, model: number | undefined | null): number {
  if (!model) return clamp(deterministic);
  return clamp((deterministic + model) / 2);
}

// Automation potential on a 1-5 scale from the autonomy gain.
export function automationPotential(current: AutonomyLevel, target: AutonomyLevel): number {
  const gain = AUTONOMY_COEFFICIENTS[target] - AUTONOMY_COEFFICIENTS[current];
  return Math.max(1, Math.min(5, 1 + gain * 4));
}

// Opportunity Score = Business Value × Automation Potential ÷ Difficulty. Risk is shown separately.
export function opportunityScore(o: { businessValue: number; automationDifficulty: number; currentAutonomyLevel: AutonomyLevel; targetAutonomyLevel: AutonomyLevel }) {
  const score = (o.businessValue * automationPotential(o.currentAutonomyLevel, o.targetAutonomyLevel)) / Math.max(o.automationDifficulty, 1);
  return Math.round(score * 100) / 100;
}
