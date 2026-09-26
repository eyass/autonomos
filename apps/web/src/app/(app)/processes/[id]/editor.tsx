"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, CardBody, CardHeader, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { updateProcessAction } from "../actions";

type Step = { title: string; system?: string; performedBy?: string; requiresJudgement?: boolean };
type Initial = {
  title: string;
  description: string;
  departmentId: string | null;
  trigger: string | null;
  frequency: "ad_hoc" | "daily" | "weekly" | "monthly" | "event_driven";
  estimatedOccurrencesPerMonth: number | null;
  estimatedMinutesPerOccurrence: number | null;
  currentAutonomyLevel: number;
  potentialAutonomyLevel: number;
  businessValue: number;
  automationDifficulty: number;
  riskLevel: number;
  notes: string | null;
  steps: Step[];
  systems: string[];
  roles: string[];
};

const num = (v: string) => (v.trim() === "" ? null : Number(v));

export function ProcessEditor({ id, initial, departments }: { id: string; initial: Initial; departments: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof Initial>(k: K, value: Initial[K]) => setV((s) => ({ ...s, [k]: value }));
  const setStep = (i: number, patch: Partial<Step>) => set("steps", v.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Edit process
      </Button>
    );
  }
  const score = (k: "businessValue" | "automationDifficulty" | "riskLevel" | "currentAutonomyLevel" | "potentialAutonomyLevel", label: string, prefix = "") => (
    <Field label={label}>
      <Select value={v[k]} onChange={(e) => set(k, Number(e.target.value))}>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {prefix}
            {n}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <Card>
      <CardHeader title="Edit process" description="Your corrections are kept and used for opportunity analysis." />
      <CardBody className="space-y-4">
        <Field label="Name">
          <Input value={v.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Description">
          <Textarea value={v.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department">
            <Select value={v.departmentId ?? ""} onChange={(e) => set("departmentId", e.target.value || null)}>
              <option value="">None</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Trigger">
            <Input value={v.trigger ?? ""} onChange={(e) => set("trigger", e.target.value || null)} />
          </Field>
          <Field label="Frequency">
            <Select value={v.frequency} onChange={(e) => set("frequency", e.target.value as Initial["frequency"])}>
              <option value="event_driven">When it happens</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="ad_hoc">Ad hoc</option>
            </Select>
          </Field>
          <Field label="Occurrences per month">
            <Input type="number" min={0} value={v.estimatedOccurrencesPerMonth ?? ""} onChange={(e) => set("estimatedOccurrencesPerMonth", num(e.target.value))} />
          </Field>
          <Field label="Minutes per occurrence" hint="Baseline for time saved">
            <Input type="number" min={0} value={v.estimatedMinutesPerOccurrence ?? ""} onChange={(e) => set("estimatedMinutesPerOccurrence", num(e.target.value))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {score("currentAutonomyLevel", "Current", "L")}
          {score("potentialAutonomyLevel", "Potential", "L")}
          {score("businessValue", "Value")}
          {score("automationDifficulty", "Difficulty")}
          {score("riskLevel", "Risk")}
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">Steps</div>
          <div className="space-y-2">
            {v.steps.map((s, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-border p-2 sm:grid-cols-12 sm:border-0 sm:p-0">
                <Input className="col-span-2 sm:col-span-5" value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} placeholder={`Step ${i + 1}`} aria-label={`Step ${i + 1}`} />
                <Input className="sm:col-span-3" value={s.performedBy ?? ""} onChange={(e) => setStep(i, { performedBy: e.target.value })} placeholder="Who" aria-label="Who" />
                <Input className="sm:col-span-2" value={s.system ?? ""} onChange={(e) => setStep(i, { system: e.target.value })} placeholder="System" aria-label="System" />
                <label className="flex items-center gap-2 text-xs text-muted sm:col-span-1" title="Requires judgement">
                  <input type="checkbox" checked={Boolean(s.requiresJudgement)} onChange={(e) => setStep(i, { requiresJudgement: e.target.checked })} />
                  <span className="sm:sr-only">Needs judgement</span>
                </label>
                <button type="button" className="justify-self-end text-xs text-muted hover:text-danger sm:col-span-1 sm:justify-self-start" onClick={() => set("steps", v.steps.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={() => set("steps", [...v.steps, { title: "" }])}>
              Add step
            </Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Systems" hint="Comma separated">
            <Input value={v.systems.join(", ")} onChange={(e) => set("systems", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
          </Field>
          <Field label="Roles" hint="Comma separated">
            <Input value={v.roles.join(", ")} onChange={(e) => set("roles", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} rows={2} />
        </Field>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="flex gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await updateProcessAction(id, { ...v, steps: v.steps.filter((s) => s.title.trim()) });
                if (!r.ok) return setError(r.error);
                setOpen(false);
                router.refresh();
              })
            }
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
