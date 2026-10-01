"use client";
import { AUTONOMY_LEVELS, INTEGRATION_EVENTS, modeOf, type AgentConfig, type ConditionRule } from "@autonomos/schemas";
import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { AutonomyLadder } from "@/components/domain";
import { systemName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

export type ToolOption = { key: string; label: string; description: string; access: "read" | "write"; integration: string; highRisk: boolean };

const TRIGGER_CHOICES = {
  new_record: { title: "Each new record", description: "A new ticket, email or deal in a connected system" },
  manual: { title: "Manual", description: "Run it yourself" },
  schedule: { title: "Schedule", description: "For example every weekday at 09:00" },
  integration_event: { title: "Webhook event", description: "An event your own systems send" },
} as const;

const STEPS = ["Objective", "Trigger", "Instructions", "What the agent can do", "Autonomy and controls", "Review"] as const;

const lines = (v: string) =>
  v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

function ListField({ label, hint, value, onChange }: { label: string; hint?: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join("\n"));
  return (
    <FormField label={label} hint={hint ?? "One per line"}>
      <Textarea
        rows={Math.max(3, value.length + 1)}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(lines(e.target.value));
        }}
      />
    </FormField>
  );
}

function triggerLabel(t: AgentConfig["trigger"]) {
  if (t.type === "manual") return "run manually";
  if (t.type === "schedule") return `on a schedule (${t.cron}, ${t.timezone})`;
  if (t.type === "new_record") return `for each new record in ${systemName(t.integration)}`;
  return `when ${INTEGRATION_EVENTS.find((e) => e.key === t.event)?.label ?? t.event}`;
}

export function AgentConfigForm({
  initial,
  tools,
  submitLabel,
  onSubmit,
  showNote,
  origin = "opportunity",
}: {
  initial: AgentConfig;
  tools: ToolOption[];
  submitLabel: string;
  onSubmit: (config: AgentConfig, note: string) => Promise<{ ok: false; error: string } | { ok: true; data?: unknown } | undefined>;
  showNote?: boolean;
  // Where the starting configuration came from, for the "this differs" callouts on Review.
  origin?: "opportunity" | "current version";
}) {
  const [step, setStep] = useState(0);
  const [c, setC] = useState<AgentConfig>(initial);
  const [toolQuery, setToolQuery] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof AgentConfig>(k: K, v: AgentConfig[K]) => setC((s) => ({ ...s, [k]: v }));
  const setInstr = <K extends keyof AgentConfig["instructions"]>(k: K, v: AgentConfig["instructions"][K]) => setC((s) => ({ ...s, instructions: { ...s.instructions, [k]: v } }));
  const setPolicy = <K extends keyof AgentConfig["policy"]>(k: K, v: AgentConfig["policy"][K]) => setC((s) => ({ ...s, policy: { ...s.policy, [k]: v } }));
  const selectedTools = tools.filter((t) => c.tools.includes(t.key));
  // Systems a "new record" trigger can watch: the connected ones the agent's tools come from first.
  const systems = [...new Set([...selectedTools, ...tools].map((t) => t.integration).filter((i) => i !== "knowledge"))];
  const moneyTools = selectedTools.filter((t) => t.key === "stripe.create_refund");

  const submit = () =>
    start(async () => {
      setError(null);
      if (!c.tools.length) return setError("Choose at least one thing the agent can do");
      const r = await onSubmit(c, note);
      if (r && !r.ok) setError(r.error);
    });

  return (
    <div className="grid gap-4 lg:grid-cols-4 lg:gap-6">
      <div className="lg:hidden">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Step {step + 1} of {STEPS.length}
          </span>
          {step < STEPS.length - 1 ? <span>Next: {STEPS[step + 1]}</span> : null}
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} aria-label={`Step ${step + 1} of ${STEPS.length}`} />
      </div>
      <ol className="hidden space-y-1 text-sm lg:block">
        {STEPS.map((s, i) => (
          <li key={s}>
            <Button
              type="button"
              variant="ghost"
              aria-current={i === step ? "step" : undefined}
              onClick={() => setStep(i)}
              className={cn("h-auto w-full justify-start gap-2.5 py-2 whitespace-normal text-left", i === step ? "bg-brand-soft font-semibold text-brand-strong hover:bg-brand-soft" : "text-muted-foreground")}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold",
                  i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-highlight text-white" : "border border-border bg-card",
                )}
              >
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="sr-only">{i + 1}. </span>
              {s}
            </Button>
          </li>
        ))}
      </ol>
      <Card className="min-w-0 lg:col-span-3">
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 ? (
            <>
              <FormField label="Agent name" hint="Name it after the work, for example Refund handling">
                <Input value={c.name} onChange={(e) => set("name", e.target.value)} />
              </FormField>
              <FormField label="Objective" hint="The outcome to achieve">
                <Textarea value={c.instructions.objective} onChange={(e) => setInstr("objective", e.target.value)} rows={2} />
              </FormField>
              <ListField label="Success criteria" value={c.successCriteria} onChange={(v) => set("successCriteria", v)} />
            </>
          ) : null}
          {step === 1 ? (
            <>
              <RadioGroup
                className="grid gap-2 sm:grid-cols-2"
                value={c.trigger.type}
                onValueChange={(t) =>
                  set(
                    "trigger",
                    t === "manual"
                      ? { type: "manual" }
                      : t === "schedule"
                        ? { type: "schedule", cron: "0 9 * * 1-5", timezone: "Europe/Amsterdam" }
                        : t === "new_record"
                          ? { type: "new_record", integration: systems[0] ?? "zendesk" }
                          : { type: "integration_event", event: "zendesk.ticket.created" },
                  )
                }
              >
                {(["new_record", "manual", "schedule", "integration_event"] as const).map((t) => (
                  <FieldLabel key={t} htmlFor={`trigger-${t}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{TRIGGER_CHOICES[t].title}</FieldTitle>
                        <FieldDescription>{TRIGGER_CHOICES[t].description}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={t} id={`trigger-${t}`} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
              {c.trigger.type === "schedule" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Cron schedule" hint="0 9 * * 1-5 is every weekday at 09:00">
                    <Input value={c.trigger.cron} onChange={(e) => set("trigger", { ...c.trigger, type: "schedule", cron: e.target.value } as AgentConfig["trigger"])} />
                  </FormField>
                  <FormField label="Time zone">
                    <Input value={c.trigger.timezone} onChange={(e) => set("trigger", { ...c.trigger, type: "schedule", timezone: e.target.value } as AgentConfig["trigger"])} />
                  </FormField>
                </div>
              ) : null}
              {c.trigger.type === "new_record" ? (
                <FormField label="System" hint="Every new ticket, email or record there starts one run. Records already there when the agent goes live are skipped.">
                  <NativeSelect value={c.trigger.integration} onChange={(e) => set("trigger", { type: "new_record", integration: e.target.value })}>
                    {[...new Set([c.trigger.integration, ...systems])].map((s) => (
                      <NativeSelectOption key={s} value={s}>
                        {systemName(s)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </FormField>
              ) : null}
              {c.trigger.type === "integration_event" ? (
                <FormField label="Event">
                  <NativeSelect value={c.trigger.event} onChange={(e) => set("trigger", { type: "integration_event", event: e.target.value })}>
                    {INTEGRATION_EVENTS.map((e) => (
                      <NativeSelectOption key={e.key} value={e.key}>
                        {e.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </FormField>
              ) : null}
            </>
          ) : null}
          {step === 2 ? (
            <>
              <FormField label="Context" hint="Business and process context the agent needs">
                <Textarea value={c.instructions.context} onChange={(e) => setInstr("context", e.target.value)} rows={3} />
              </FormField>
              <ListField label="Rules" hint="Must-follow constraints, one per line" value={c.instructions.rules} onChange={(v) => setInstr("rules", v)} />
              <ListField label="Steps" hint="Expected operating procedure" value={c.instructions.steps} onChange={(v) => setInstr("steps", v)} />
              <ListField label="When to hand to a human" value={c.instructions.escalationConditions} onChange={(v) => setInstr("escalationConditions", v)} />
              <ListField label="How completion is determined" value={c.instructions.successConditions} onChange={(v) => setInstr("successConditions", v)} />
              <Alert variant="info">
                <AlertDescription>
                  Instructions guide the agent. Money limits, approvals and allowed actions below are enforced by the platform regardless of what the instructions say.
                </AlertDescription>
              </Alert>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <p className="text-sm text-muted-foreground">The agent can only use what you tick here. Actions from other connected systems stay unavailable to it.</p>
              {tools.length === 0 ? (
                <Alert variant="warning">
                  <AlertDescription>Connect an integration first.</AlertDescription>
                </Alert>
              ) : null}
              {tools.length > 12 ? <Input value={toolQuery} onChange={(e) => setToolQuery(e.target.value)} placeholder="Find an action, e.g. create invoice" aria-label="Find an action" /> : null}
              {/* One group per system; each opens when it has chosen tools or the search matches. */}
              <div className="space-y-2">
                {[...new Set(tools.map((t) => t.integration))].map((system) => {
                  const q = toolQuery.trim().toLowerCase();
                  const inSystem = tools.filter((t) => t.integration === system && (!q || `${t.label} ${t.description}`.toLowerCase().includes(q)));
                  if (!inSystem.length) return null;
                  const chosen = inSystem.filter((t) => c.tools.includes(t.key)).length;
                  return (
                    <details key={system} open={Boolean(q) || chosen > 0 || tools.length <= 12} className="rounded-md border border-border">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-medium capitalize">
                        {system.replaceAll("_", " ")}
                        <span className="text-xs font-normal text-muted-foreground">
                          {chosen ? `${chosen} of ${inSystem.length} chosen` : `${inSystem.length} action${inSystem.length === 1 ? "" : "s"}`}
                        </span>
                      </summary>
                      <div className="space-y-2 border-t border-border p-3">
                        {inSystem.map((t) => (
                          <FieldLabel key={t.key} htmlFor={`tool-${t.key}`}>
                            <Field orientation="horizontal" className="items-start">
                              <Checkbox
                                id={`tool-${t.key}`}
                                className="mt-0.5"
                                checked={c.tools.includes(t.key)}
                                onCheckedChange={(v) => set("tools", v === true ? [...c.tools, t.key] : c.tools.filter((x) => x !== t.key))}
                              />
                              <FieldContent>
                                <FieldTitle className="flex-wrap">{t.label}</FieldTitle>
                                <FieldDescription className="line-clamp-2">{t.description}</FieldDescription>
                                {t.access === "write" ? (
                                  <Badge variant={t.highRisk ? "warning" : "info"}>{t.highRisk ? "takes action, approval by default" : "takes action"}</Badge>
                                ) : (
                                  <Badge variant="secondary">read only</Badge>
                                )}
                              </FieldContent>
                            </Field>
                          </FieldLabel>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </>
          ) : null}
          {step === 4 ? (
            <>
              <div>
                <div className="mb-2 text-sm font-medium">Mode</div>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  className="w-full"
                  value={String(modeOf(c.autonomyLevel).level)}
                  onValueChange={(v) => v && set("autonomyLevel", Number(v) as AgentConfig["autonomyLevel"])}
                >
                  {AUTONOMY_LEVELS.filter((l) => l.level > 1).map((l) => (
                    <ToggleGroupItem
                      key={l.level}
                      value={String(l.level)}
                      className="flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                      aria-label={l.name}
                    >
                      {l.name}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{modeOf(c.autonomyLevel).name}:</span> {modeOf(c.autonomyLevel).short}. Start at Approve for anything involving
                  money or customers.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Minimum confidence to act alone" hint="Below this, a human approves">
                  <Input type="number" step={0.05} min={0} max={1} value={c.policy.confidenceThreshold} onChange={(e) => setPolicy("confidenceThreshold", Number(e.target.value))} />
                </FormField>
                <FormField label="Maximum actions per run">
                  <Input type="number" min={1} value={c.policy.maxActionsPerRun} onChange={(e) => setPolicy("maxActionsPerRun", Number(e.target.value))} />
                </FormField>
                <FormField label="Maximum actions per day">
                  <Input type="number" min={1} value={c.policy.maxActionsPerDay} onChange={(e) => setPolicy("maxActionsPerDay", Number(e.target.value))} />
                </FormField>
              </div>
              {moneyTools.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Maximum refund without approval" hint={c.autonomyLevel <= 3 ? "In Approve mode every refund needs approval" : "Refunds above this need a person"}>
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
                  </FormField>
                  <FormField label="Hard limit per refund" hint="Never refunded, even with approval">
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
                  </FormField>
                </div>
              ) : null}
              <div>
                <div className="mb-2 text-sm font-medium">Always ask a human before</div>
                <div className="flex flex-wrap gap-2">
                  {selectedTools
                    .filter((t) => t.access === "write")
                    .map((t) => (
                      <Field key={t.key} orientation="horizontal" className="w-auto rounded-md border px-3 py-2">
                        <Checkbox
                          id={`ask-${t.key}`}
                          checked={c.policy.approvalRequiredFor.includes(t.key)}
                          onCheckedChange={(v) => setPolicy("approvalRequiredFor", v === true ? [...c.policy.approvalRequiredFor, t.key] : c.policy.approvalRequiredFor.filter((x) => x !== t.key))}
                        />
                        <FieldLabel htmlFor={`ask-${t.key}`} className="font-normal">
                          {t.label}
                        </FieldLabel>
                      </Field>
                    ))}
                </div>
              </div>
              {c.policy.conditions.length ? (
                <div>
                  <div className="mb-2 text-sm font-medium">Extra rules</div>
                  <ul className="space-y-1 text-sm">
                    {c.policy.conditions.map((r: ConditionRule, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-1.5">
                        <span>
                          {r.label} <Badge variant={r.effect === "deny" ? "danger" : "warning"}>{r.effect === "deny" ? "blocks" : "needs approval"}</Badge>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setPolicy(
                              "conditions",
                              c.policy.conditions.filter((_, j) => j !== i),
                            )
                          }
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
          {step === 5 ? (
            <div className="space-y-4 text-sm">
              {triggerLabel(c.trigger) !== triggerLabel(initial.trigger) ? (
                <Alert variant="warning">
                  <AlertDescription>
                    The trigger differs from the {origin === "opportunity" ? "opportunity's suggestion" : "current version"}: {triggerLabel(initial.trigger)} → {triggerLabel(c.trigger)}. Check that
                    the agent still does the work {origin === "opportunity" ? "the opportunity describes" : "it was set up for"}.
                  </AlertDescription>
                </Alert>
              ) : null}
              {c.autonomyLevel > initial.autonomyLevel ? (
                <Alert variant="warning">
                  <AlertDescription>
                    The mode is more autonomous than {origin === "opportunity" ? "suggested" : "before"}: {modeOf(initial.autonomyLevel).name} → {modeOf(c.autonomyLevel).name}. The agent will act without approval more often.
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-base font-semibold">{c.name}</div>
                <AutonomyLadder current={c.autonomyLevel} />
              </div>
              <p>{c.instructions.objective}</p>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">What the agent can do</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTools.map((t) => (
                    <Badge key={t.key} variant={t.access === "write" ? "info" : "secondary"}>
                      {t.label}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Where humans stay responsible</div>
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
                <FormField label="What changed?" hint="Saved with the new version">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} />
                </FormField>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
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
        </CardContent>
      </Card>
    </div>
  );
}
