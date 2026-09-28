import { describe, expect, it } from "vitest";
import { PLANS, planFor, runAllowance } from "./index";

describe("plans", () => {
  it("steps up from free to paid", () => {
    const [free, starter, growth] = [PLANS.design_partner, PLANS.starter, PLANS.growth];
    expect(free.activeAgents).toBeLessThan(starter.activeAgents);
    expect(free.runsPerMonth).toBeLessThan(starter.runsPerMonth);
    expect(starter.activeAgents).toBeLessThan(growth.activeAgents);
    expect(starter.runsPerMonth).toBeLessThan(growth.runsPerMonth);
    expect(free.price).toBe(0);
  });

  it("caps the free plan and lets paid plans run into overage", () => {
    expect(runAllowance(planFor(null), 249)).toEqual({ allowed: true, remaining: 1 });
    expect(runAllowance(planFor("design_partner"), 250)).toEqual({ allowed: false, remaining: 0 });
    expect(runAllowance(planFor("starter"), 5000).allowed).toBe(true);
  });
});
