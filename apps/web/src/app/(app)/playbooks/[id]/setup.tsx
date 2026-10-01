"use client";
import { Check, CircleDashed, Database, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { AddSystems, SystemLogo } from "../../integrations/add-systems";
import { connectDirectoryAction, connectSandboxAction } from "../../integrations/actions";
import { startPlaybookAction } from "../actions";

type Step = { title: string; detail: string; capability: string | null; access: "read" | "write" | "none" };
type Tool = { key: string; name: string; logo: string | null };
type Dataset = { project: string; dataset: string; location?: string; tables: number };
type Slot = {
  capability: string;
  label: string;
  hint: string;
  group: string;
  options: Tool[];
  // Other connected tools, for when these records live somewhere else.
  others: Tool[];
  suggestions: Array<Tool & { slug: string; sandbox: boolean }>;
  // Every step of this kind only looks things up, so a data warehouse can stand in.
  readOnly: boolean;
  warehouses: Array<Tool & { datasets: Dataset[] | null }>;
};
const datasetKey = (d: { project: string; dataset: string }) => `${d.project}.${d.dataset}`;
// A kind of system in a sentence: "help desk", but acronyms like CRM and HR stay as they are.
const lower = (label: string) => (/^[A-Z]{2,}$/.test(label) ? label : label.toLowerCase());

const LEVEL: Record<number, string> = {
  2: "Drafts the work; a person sends it",
  3: "Proposes each change; a person approves it",
  4: "Acts on routine cases; asks a person about the rest",
};

const ACCESS: Record<Step["access"], string> = { read: "Looks up", write: "Changes", none: "Decides" };

// A playbook in a workspace: each step shows the tool it will use, and every kind of system the
// playbook needs gets one of the workspace's tools (or a way to connect one) before it can start.
export function PlaybookSetup({
  id,
  trigger,
  steps,
  slots,
  agent,
  minutes,
  canConnect,
  liveConnect,
  sensitive,
  policyFields,
  currency,
  connected,
  connectedFor,
  warehouseNames,
}: {
  id: string;
  trigger: string | null;
  steps: Step[];
  slots: Slot[];
  agent: { level: number; objective: string; escalations: string[] };
  minutes: number | null;
  canConnect: boolean;
  liveConnect: boolean;
  // Regulated areas the work touches; someone must sign off on compliance.
  sensitive: string[];
  // The company's numbers the agent enforces in those areas (limits, windows).
  policyFields: Array<{ key: string; label: string; unit: "money" | "days" | "count" | "text"; area: string }>;
  currency: string;
  // The system just connected (back from its sign-in), to say what it now covers.
  connected?: { key: string; name: string } | null;
  // The kind of system it was connected for, when connected from that step.
  connectedFor?: string | null;
  // Connected data warehouses, to explain where one cannot stand in.
  warehouseNames: string[];
}) {
  // What the person picked. A slot they did not touch uses its first recommended tool; any other
  // tool is used only once picked, or when it was connected for that slot just now.
  const [picked, setPicked] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      slots.flatMap((s) => {
        if (!connected || s.options.some((o) => o.key === connected.key)) return [];
        const fits = s.warehouses.some((w) => w.key === connected.key) || s.others.some((o) => o.key === connected.key);
        return fits && (connectedFor === s.capability || (!connectedFor && s.warehouses.some((w) => w.key === connected.key))) ? [[s.capability, connected.key]] : [];
      }),
    ),
  );
  const [datasets, setDatasets] = useState<Record<string, string>>({});
  const choices = (s: Slot) => [...s.options, ...s.warehouses, ...s.others];
  const bindings: Record<string, string> = Object.fromEntries(
    slots.flatMap((s) => {
      const key = choices(s).find((o) => o.key === picked[s.capability])?.key ?? s.options[0]?.key;
      return key ? [[s.capability, key]] : [];
    }),
  );
  const isOther = (s: Slot) => s.others.some((o) => o.key === bindings[s.capability]);
  const warehouseOf = (s: Slot) => s.warehouses.find((w) => w.key === bindings[s.capability] && !s.options.some((o) => o.key === w.key)) ?? null;
  const scopes = Object.fromEntries(
    slots.flatMap((s) => {
      const w = warehouseOf(s);
      const d = w?.datasets?.find((x) => datasetKey(x) === datasets[s.capability]);
      return d ? [[s.capability, { project: d.project, dataset: d.dataset, ...(d.location ? { location: d.location } : {}) }]] : [];
    }),
  );
  const [count, setCount] = useState("");
  const [mins, setMins] = useState(minutes ? String(Math.round(minutes)) : "");
  const [owner, setOwner] = useState("");
  const [policy, setPolicy] = useState<Record<string, string>>({});
  const policyMissing = policyFields.some((f) => !(policy[f.key] ?? "").trim());
  const [pending, start] = useTransition();
  const [connecting, setConnecting] = useState<string | null>(null);
  const router = useRouter();
  const slotOf = (c: string | null) => slots.find((s) => s.capability === c);
  const toolFor = (c: string | null) => {
    const s = slotOf(c);
    if (!s) return null;
    const w = warehouseOf(s);
    if (w) return { ...w, name: `${w.name} · ${scopes[s.capability]?.dataset ?? "pick a dataset"}` };
    return choices(s).find((o) => o.key === bindings[s.capability]) ?? null;
  };
  // A slot is unfilled without a tool, or with a warehouse but no dataset picked.
  const missing = slots.filter((s) => !bindings[s.capability] || (warehouseOf(s) && !scopes[s.capability]));
  const returnTo = `/playbooks/${id}`;
  const returnFor = (s: Slot) => `${returnTo}?for=${s.capability}`;

  const sandbox = (key: string) => {
    setConnecting(key);
    start(async () => {
      const r = await connectSandboxAction(key);
      setConnecting(null);
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  };
  const live = (slug: string) => {
    setConnecting(slug);
    start(async () => {
      const r = await connectDirectoryAction(slug, returnTo);
      setConnecting(null);
      if (r && !r.ok) toast.error(r.error);
    });
  };
  const submit = () =>
    start(async () => {
      const r = await startPlaybookAction(id, {
        occurrencesPerMonth: count,
        minutesPerOccurrence: mins,
        bindings,
        ...(Object.keys(scopes).length ? { scopes } : {}),
        ...(sensitive.length ? { complianceOwner: owner, policy } : {}),
      });
      if (r && !r.ok) toast.error(r.error);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
        <Card className="gap-3 px-4 py-4 sm:gap-3 sm:px-6 sm:py-5">
          <h2 className="text-sm font-semibold">Steps</h2>
          {trigger ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Starts when </span>
              {trigger.replace(/^./, (c) => c.toLowerCase())}
            </p>
          ) : null}
          <ol className="space-y-3" data-testid="playbook-steps">
            {steps.map((s, i) => {
              const slot = slotOf(s.capability);
              const tool = toolFor(s.capability);
              return (
                <li key={i} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{s.title}</div>
                    {s.detail ? <div className="text-xs text-muted-foreground">{s.detail}</div> : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant="secondary">{ACCESS[s.access]}</Badge>
                      {slot ? (
                        tool ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5">
                            <SystemLogo src={tool.logo} name={tool.name} className="size-4" />
                            {tool.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-muted-foreground">
                            <CircleDashed className="size-3" />
                            Your {lower(slot.label)}
                          </span>
                        )
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
        <Card className="gap-3 px-4 py-4 sm:gap-3 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">The agent</h2>
            <Badge variant="info">Level {agent.level}</Badge>
            <span className="text-xs text-muted-foreground">{LEVEL[agent.level]}</span>
          </div>
          <p className="text-sm">{agent.objective}</p>
          {agent.escalations.length ? (
            <div className="border-t pt-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Hands to a person when</div>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {agent.escalations.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>
      <aside className="space-y-4">
        {connected ? <ConnectedNote connected={connected} slots={slots} picked={slots.filter((s) => bindings[s.capability] === connected.key).map((s) => s.capability)} /> : null}
        <Card className="gap-4 px-4 py-4 sm:gap-4 sm:py-4" data-testid="playbook-tools">
          <div>
            <h2 className="text-sm font-semibold">Your tools</h2>
            <p className="text-xs text-muted-foreground">Pick the tool this playbook uses for each kind of system.</p>
          </div>
          {slots.map((s) => (
            <div key={s.capability} className="space-y-2 border-t pt-3 first:border-0 first:pt-0" data-testid={`slot-${s.capability}`}>
              <div className="flex items-center gap-2">
                {bindings[s.capability] && !missing.includes(s) ? <Check className="size-4 text-success" /> : <CircleDashed className="size-4 text-muted-foreground" />}
                <Label htmlFor={`bind-${s.capability}`} className="text-sm font-medium">
                  {s.label}
                </Label>
                <span className="truncate text-xs text-muted-foreground">{s.hint}</span>
              </div>
              {choices(s).length ? (
                <NativeSelect id={`bind-${s.capability}`} value={bindings[s.capability] ?? ""} onChange={(e) => setPicked((b) => ({ ...b, [s.capability]: e.target.value }))}>
                  {s.options.length ? null : <option value="">Pick a tool</option>}
                  {s.options.length ? (
                    <optgroup label="Recommended">
                      {s.options.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {s.warehouses.length ? (
                    <optgroup label="Data warehouse">
                      {s.warehouses.map((w) => (
                        <option key={w.key} value={w.key}>
                          {w.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {s.others.length ? (
                    <optgroup label="Your other tools">
                      {s.others.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </NativeSelect>
              ) : null}
              {isOther(s) ? (
                <p className="text-xs text-muted-foreground">
                  Not a usual {lower(s.label)} tool. AI looks for actions in it that do these steps, and says so when you start if it has none.
                </p>
              ) : null}
              {(() => {
                const w = warehouseOf(s);
                if (!w) return null;
                if (w.datasets === null) return <p className="text-xs text-muted-foreground">Listing the datasets in {w.name}. Reload in a minute.</p>;
                if (!w.datasets.length)
                  return <p className="text-xs text-warning">No datasets found in {w.name}. Check that the connected account can view them, then choose Map again in Integrations.</p>;
                return (
                  <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-2.5">
                    <Label htmlFor={`dataset-${s.capability}`} className="flex items-center gap-1.5 text-xs font-medium">
                      <Database className="size-3.5" /> Dataset with your {lower(s.label)} records
                    </Label>
                    <NativeSelect id={`dataset-${s.capability}`} value={datasets[s.capability] ?? ""} onChange={(e) => setDatasets((d) => ({ ...d, [s.capability]: e.target.value }))}>
                      <option value="">Pick a dataset</option>
                      {w.datasets.map((d) => (
                        <option key={datasetKey(d)} value={datasetKey(d)}>
                          {datasetKey(d)}
                          {d.tables ? ` · ${d.tables} table${d.tables === 1 ? "" : "s"}` : ""}
                        </option>
                      ))}
                    </NativeSelect>
                    <p className="text-xs text-muted-foreground">The agent can only run SELECT queries in this dataset, at most 50 rows each. It cannot change anything there.</p>
                  </div>
                );
              })()}
              {!s.readOnly && warehouseNames.length && !s.options.length ? (
                <p className="text-xs text-muted-foreground">
                  {warehouseNames.join(" and ")} cannot stand in here: this playbook changes {lower(s.label)} records, and a data warehouse can only look things up.
                </p>
              ) : null}
              {s.options.length ? (
                canConnect && liveConnect ? (
                  <AddSystems canManage variant="ghost" size="sm" label="Connect a different tool" returnTo={returnFor(s)} />
                ) : null
              ) : canConnect ? (
                <div className="space-y-1.5">
                  {s.suggestions.map((t) => (
                    <div key={t.key} className="flex items-center gap-2 text-sm">
                      <SystemLogo src={t.logo} name={t.name} className="size-6" />
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      {t.sandbox ? (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending} onClick={() => sandbox(t.key)}>
                          {connecting === t.key ? <Spinner /> : null}
                          Sample data
                        </Button>
                      ) : null}
                      {liveConnect ? (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={pending} onClick={() => live(t.slug)}>
                          {connecting === t.slug ? <Spinner /> : null}
                          Connect
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {liveConnect ? <AddSystems canManage variant="ghost" size="sm" label="Connect a different tool" initialGroup={s.group} returnTo={returnFor(s)} /> : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Ask a workspace admin to connect a {lower(s.label)} tool.</p>
              )}
            </div>
          ))}
        </Card>
        <Card className="gap-3 px-4 py-4 sm:gap-3 sm:py-4">
          <h2 className="text-sm font-semibold">Start from this playbook</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="use-count">Times a month</Label>
              <Input id="use-count" type="number" min={1} step="any" inputMode="decimal" value={count} onChange={(e) => setCount(e.target.value)} placeholder="For example 120" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="use-minutes">Minutes each time</Label>
              <Input id="use-minutes" type="number" min={1} step="any" inputMode="decimal" value={mins} onChange={(e) => setMins(e.target.value)} />
            </div>
          </div>
          {sensitive.length ? (
            <div className="space-y-1.5">
              <Label htmlFor="use-owner">Who signs off on compliance</Label>
              <Input id="use-owner" value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={120} placeholder="A person or team" />
              <p className="text-xs text-muted-foreground">This work involves {sensitive.join(" and ")}.</p>
            </div>
          ) : null}
          {policyFields.length ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Your policy</legend>
              {policyFields.map((f) => (
                <label key={f.key} className="grid gap-1 text-sm">
                  <span>{f.label}</span>
                  <span className="flex items-center gap-2">
                    <Input
                      value={policy[f.key] ?? ""}
                      onChange={(e) => setPolicy((p) => ({ ...p, [f.key]: e.target.value }))}
                      inputMode={f.unit === "text" ? "text" : "decimal"}
                      aria-label={f.label}
                    />
                    <span className="w-10 shrink-0 text-xs text-muted-foreground">{f.unit === "money" ? currency : f.unit === "days" ? "days" : ""}</span>
                  </span>
                </label>
              ))}
              <p className="text-xs text-muted-foreground">The agent enforces these in code. Money limits can only tighten the platform limits.</p>
            </fieldset>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {missing.length
              ? missing
                  .map((m) => (warehouseOf(m) ? `pick the dataset with your ${lower(m.label)} records` : choices(m).length ? `pick the tool with your ${lower(m.label)} records` : `connect a ${lower(m.label)} tool`))
                  .join(", and ")
                  .replace(/^./, (c) => c.toUpperCase()) + " first."
              : "AI picks the actions of your tools for each step. The agent is tested on them before it can go live."}
          </p>
          <Button onClick={submit} disabled={pending || missing.length > 0 || !count || !mins || (sensitive.length > 0 && owner.trim().length < 2) || policyMissing} className="w-full sm:w-auto">
            {pending && !connecting ? <Spinner /> : null}
            Use this playbook
          </Button>
        </Card>
      </aside>
    </div>
  );
}

// What the system just connected does for this playbook: the steps it now covers, the dataset
// still to pick, or why it does not fit.
function ConnectedNote({ connected, slots, picked }: { connected: { key: string; name: string }; slots: Slot[]; picked: string[] }) {
  // Recommended for a slot, or picked for one (connected from that step).
  const covers = slots.filter((s) => s.options.some((o) => o.key === connected.key) || (picked.includes(s.capability) && s.others.some((o) => o.key === connected.key))).map((s) => lower(s.label));
  const standsIn = slots.filter((s) => s.warehouses.some((w) => w.key === connected.key) && !s.options.some((o) => o.key === connected.key)).map((s) => lower(s.label));
  const needed = slots.filter((s) => !s.options.length && !picked.includes(s.capability)).map((s) => lower(s.label));
  const text = covers.length
    ? `${connected.name} is connected and covers the ${covers.join(" and ")} steps.`
    : standsIn.length
      ? `${connected.name} is connected. Pick the dataset with your ${standsIn.join(" and ")} records to use it here.`
      : `${connected.name} is connected. Pick it for a step under Your tools if that is where those records are.${needed.length ? ` This playbook still needs a ${needed.join(" and a ")} tool.` : ""}`;
  return (
    <div role="status" className={`flex gap-2 rounded-xl border px-3 py-2.5 text-sm ${covers.length || standsIn.length ? "border-success/30 bg-success-soft text-success" : "border-border bg-muted/50 text-foreground"}`}>
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
}
