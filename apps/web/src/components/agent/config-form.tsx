"use client";
import { AUTONOMY_LEVELS, INTEGRATION_EVENTS, type AgentConfig, type ConditionRule } from "@autonomos/schemas";
import { useState, useTransition } from "react";
import { AutonomyLadder } from "@/components/domain";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

export type ToolOption = { key: string; label: string; description: string; access: "read" | "write"; integration: string; highRisk: boolean };

const STEPS = ["Objective", "Trigger", "Instructions", "What the agent can do", "Autonomy and controls", "Review"] as const;

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

function ListField({ label, hint, value, onChange }: { label: string; hint?: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join("\n"));
  return (
    <Field label={label} hint={hint ?? "One per line"}>
      <Textarea
        rows={Math.max(3, value.length + 1)}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(lines(e.target.value));
        }}
      />
    </Field>
  );
}

export function AgentConfigForm({
  initial,
  tools,
  submitLabel,
  onSubmit,
  showNote,
}: {
  initial: AgentConfig;
  tools: ToolOption[];
  submitLabel: string;
  onSubmit: (config: AgentConfig, note: string) => Promise<{ ok: false; error: string } | { ok: true; data?: unknown } | undefined>;
  showNote?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [c, setC] = useState<AgentConfig>(initial);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof AgentConfig>(k: K, v: AgentConfig[K]) => setC((s) => ({ ...s, [k]: v }));
  const setInstr = <K extends keyof AgentConfig["instructions"]>(k: K, v: AgentConfig["instructions"][K]) => setC((s) => ({ ...s, instructions: { ...s.instructions, [k]: v } }));
  const setPolicy = <K extends keyof AgentConfig["policy"]>(k: K, v: AgentConfig["policy"][K]) => setC((s) => ({ ...s, policy: { ...s.policy, [k]: v } }));
  const selectedTools = tools.filter((t) => c.tools.includes(t.key));
  const moneyTools = selectedTools.filter((t) => t.key === "stripe.create_refund");

  const submit = () =>
    start(async () => {
      setError(null);
      if (!c.tools.length) return setError("Choose at least one thing the agent can do");
      const r = await onSubmit(c, note);
      if (r && !r.ok) setError(r.error);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-4">
      <ol className="space-y-1 text-sm">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => setStep(i)} className={cn("w-full rounded-md px-3 py-2 text-left", i === step ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-muted")}>
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>
      <Card className="lg:col-span-3">
        <CardHeader title={STEPS[step]} />
        <CardBody className="space-y-4">
          {step === 0 ? (
            <>
              <Field label="Agent name" hint="Name it after the work, for example Refund handling">
                <Input value={c.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="Objective" hint="The outcome to achieve">
                <Textarea value={c.instructions.objective} onChange={(e) => setInstr("objective", e.target.value)} rows={2} />
              </Field>
              <ListField label="Success criteria" value={c.successCriteria} onChange={(v) => set("successCriteria", v)} />
            </>
          ) : null}
          {step === 1 ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["manual", "schedule", "integration_event"] as const).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => set("trigger", t === "manual" ? { type: "manual" } : t === "schedule" ? { type: "schedule", cron: "0 9 * * 1-5", timezone: "Europe/Amsterdam" } : { type: "integration_event", event: "zendesk.ticket.created" })}
                    className={cn("rounded-md border px-3 py-3 text-left text-sm", c.trigger.type === t ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-muted")}
                  >
                    <div className="font-medium">{t === "manual" ? "Manual" : t === "schedule" ? "Schedule" : "When something happens"}</div>
                    <div className="text-xs text-muted">{t === "manual" ? "Run it yourself" : t === "schedule" ? "For example every weekday at 09:00" : "An event in a connected system"}</div>
                  </button>
                ))}
              </div>
              {c.trigger.type === "schedule" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Cron schedule" hint="0 9 * * 1-5 is every weekday at 09:00">
                    <Input value={c.trigger.cron} onChange={(e) => set("trigger", { ...c.trigger, type: "schedule", cron: e.target.value } as AgentConfig["trigger"])} />
                  </Field>
                  <Field label="Time zone">
                    <Input value={c.trigger.timezone} onChange={(e) => set("trigger", { ...c.trigger, type: "schedule", timezone: e.target.value } as AgentConfig["trigger"])} />
                  </Field>
                </div>
              ) : null}
              {c.trigger.type === "integration_event" ? (
                <Field label="Event">
                  <Select value={c.trigger.event} onChange={(e) => set("trigger", { type: "integration_event", event: e.target.value })}>
                    {INTEGRATION_EVENTS.map((e) => (
                      <option key={e.key} value={e.key}>
                        {e.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Field label="Context" hint="Business and process context the agent needs">
                <Textarea value={c.instructions.context} onChange={(e) => setInstr("context", e.target.value)} rows={3} />
              </Field>
              <ListField label="Rules" hint="Must-follow constraints, one per line" value={c.instructions.rules} onChange={(v) => setInstr("rules", v)} />
              <ListField label="Steps" hint="Expected operating procedure" value={c.instructions.steps} onChange={(v) => setInstr("steps", v)} />
              <ListField label="When to hand to a human" value={c.instructions.escalationConditions} onChange={(v) => setInstr("escalationConditions", v)} />
              <ListField label="How completion is determined" value={c.instructions.successConditions} onChange={(v) => setInstr("successConditions", v)} />
              <Notice tone="info">Instructions guide the agent. Money limits, approvals and allowed actions below are enforced by the platform regardless of what the instructions say.</Notice>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <p className="text-sm text-muted">The agent can only use what you tick here. Actions from other connected systems stay unavailable to it.</p>
              {tools.length === 0 ? <Notice tone="warn">Connect an integration first.</Notice> : null}
              <div className="space-y-2">
                {tools.map((t) => (
                  <label key={t.key} className="flex items-start gap-3 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-accent/50 has-[:checked]:bg-accent-soft/40">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={c.tools.includes(t.key)}
                      onChange={(e) => set("tools", e.target.checked ? [...c.tools, t.key] : c.tools.filter((x) => x !== t.key))}
                    />
                    <span className="flex-1">
                      <span className="font-medium">{t.label}</span> <span className="text-muted">· {t.integration}</span>
                      <span className="block text-xs text-muted">{t.description}</span>
                    </span>
                    {t.access === "write" ? <Badge tone={t.highRisk ? "warn" : "info"}>{t.highRisk ? "takes action, approval by default" : "takes action"}</Badge> : <Badge>read only</Badge>}
                  </label>
                ))}
              </div>
            </>
          ) : null}
          {step === 4 ? (
            <>
              <div>
                <div className="mb-2 text-sm font-medium">Autonomy level</div>
                <div className="grid gap-2 sm:grid-cols-5">
                  {AUTONOMY_LEVELS.map((l) => (
                    <button
                      type="button"
                      key={l.level}
                      disabled={l.level === 1}
                      onClick={() => set("autonomyLevel", l.level)}
                      className={cn("rounded-md border px-2 py-2 text-left text-xs disabled:opacity-40", c.autonomyLevel === l.level ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-muted")}
                    >
                      <div className="font-semibold">{l.code}</div>
                      <div>{l.name}</div>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">{AUTONOMY_LEVELS[c.autonomyLevel - 1]?.short}. Start at L3 for anything involving money or customers.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Minimum confidence to act alone" hint="Below this, a human approves">
                  <Input type="number" step={0.05} min={0} max={1} value={c.policy.confidenceThreshold} onChange={(e) => setPolicy("confidenceThreshold", Number(e.target.value))} />
                </Field>
                <Field label="Maximum actions per run">
                  <Input type="number" min={1} value={c.policy.maxActionsPerRun} onChange={(e) => setPolicy("maxActionsPerRun", Number(e.target.value))} />
                </Field>
                <Field label="Maximum actions per day">
                  <Input type="number" min={1} value={c.policy.maxActionsPerDay} onChange={(e) => setPolicy("maxActionsPerDay", Number(e.target.value))} />
                </Field>
              </div>
              {moneyTools.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Maximum refund without approval" hint={c.autonomyLevel <= 3 ? "At L3 every refund needs approval" : "Refunds above this need a human"}>
                    <Input
                      type="number"
                      min={0}
                      value={c.policy.amountThresholds.find((t) => t.tool === "stripe.create_refund")?.maxWithoutApproval ?? 0}
                      onChange={(e) =>
                        setPolicy("amountThresholds", [
                          ...c.policy.amountThresholds.filter((t) => t.tool !== "stripe.create_refund"),
                          { tool: "stripe.create_refund", field: "amount", maxWithoutApproval: Number(e.target.value) },
                        ])
                      }
                    />
                  </Field>
                  <Field label="Hard limit per refund" hint="Never refunded, even with approval">
                    <Input
                      type="number"
                      min={0}
                      value={c.policy.hardLimits.find((t) => t.tool === "stripe.create_refund")?.max ?? ""}
                      onChange={(e) =>
                        setPolicy("hardLimits", [
                          ...c.policy.hardLimits.filter((t) => t.tool !== "stripe.create_refund"),
                          ...(e.target.value === "" ? [] : [{ tool: "stripe.create_refund", field: "amount", max: Number(e.target.value) }]),
                        ])
                      }
                    />
                  </Field>
                </div>
              ) : null}
              <div>
                <div className="mb-2 text-sm font-medium">Always ask a human before</div>
                <div className="flex flex-wrap gap-2">
                  {selectedTools
                    .filter((t) => t.access === "write")
                    .map((t) => (
                      <label key={t.key} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                        <input
                          type="checkbox"
                          checked={c.policy.approvalRequiredFor.includes(t.key)}
                          onChange={(e) => setPolicy("approvalRequiredFor", e.target.checked ? [...c.policy.approvalRequiredFor, t.key] : c.policy.approvalRequiredFor.filter((x) => x !== t.key))}
                        />
                        {t.label}
                      </label>
                    ))}
                </div>
              </div>
              {c.policy.conditions.length ? (
                <div>
                  <div className="mb-2 text-sm font-medium">Extra rules</div>
                  <ul className="space-y-1 text-sm">
                    {c.policy.conditions.map((r: ConditionRule, i) => (
                      <li key={i} className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-1.5">
                        <span>
                          {r.label} <Badge tone={r.effect === "deny" ? "danger" : "warn"}>{r.effect === "deny" ? "blocks" : "needs approval"}</Badge>
                        </span>
                        <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => setPolicy("conditions", c.policy.conditions.filter((_, j) => j !== i))}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
          {step === 5 ? (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-base font-semibold">{c.name}</div>
                <AutonomyLadder current={c.autonomyLevel} />
              </div>
              <p>{c.instructions.objective}</p>
              <div>
                <div className="mb-1 text-xs font-medium text-muted">What the agent can do</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTools.map((t) => (
                    <Badge key={t.key} tone={t.access === "write" ? "info" : "neutral"}>
                      {t.label}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Where humans stay responsible</div>
                <ul className="list-inside list-disc">
                  {c.autonomyLevel <= 3 ? <li>Approve every action before it happens</li> : null}
                  {c.policy.amountThresholds.map((t) => (
                    <li key={t.tool}>Approve refunds above {t.maxWithoutApproval}</li>
                  ))}
                  <li>Approve when the agent&apos;s confidence is below {Math.round(c.policy.confidenceThreshold * 100)}%</li>
                  {c.policy.conditions.map((r) => (
                    <li key={r.label}>{r.label}</li>
                  ))}
                  {c.instructions.escalationConditions.map((e) => (
                    <li key={e}>Take over when: {e.toLowerCase()}</li>
                  ))}
                </ul>
              </div>
              {showNote ? (
                <Field label="What changed?" hint="Saved with the new version">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              ) : null}
            </div>
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex justify-between pt-2">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
            ) : (
              <Button onClick={submit} disabled={pending}>
                {pending ? "Saving…" : submitLabel}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
