"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { updateProcessAction } from "../actions";
import { FormField } from "@/components/app/form-field";
import { TagPicker, type TagOption } from "@/components/app/tag-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

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

export function ProcessEditor({
  id,
  initial,
  departments,
  systemOptions,
  roleOptions,
}: {
  id: string;
  initial: Initial;
  departments: Array<{ id: string; name: string }>;
  systemOptions: TagOption[];
  roleOptions: TagOption[];
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const dirty = open && JSON.stringify(v) !== JSON.stringify(initial);
  // Leaving the page with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const cancel = () => {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setV(initial);
    setOpen(false);
  };
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof Initial>(k: K, value: Initial[K]) => setV((s) => ({ ...s, [k]: value }));
  const setStep = (i: number, patch: Partial<Step>) =>
    set(
      "steps",
      v.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    );

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit process
      </Button>
    );
  }
  const score = (k: "businessValue" | "automationDifficulty" | "riskLevel" | "currentAutonomyLevel" | "potentialAutonomyLevel", label: string, prefix = "") => (
    <FormField label={label}>
      <NativeSelect value={v[k]} onChange={(e) => set(k, Number(e.target.value))}>
        {[1, 2, 3, 4, 5].map((n) => (
          <NativeSelectOption key={n} value={n}>
            {prefix}
            {n}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </FormField>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit process</CardTitle>
        <CardDescription>Your corrections are kept and used for opportunity analysis.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField label="Name">
          <Input value={v.title} onChange={(e) => set("title", e.target.value)} />
        </FormField>
        <FormField label="Description">
          <Textarea value={v.description} onChange={(e) => set("description", e.target.value)} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Department">
            <NativeSelect value={v.departmentId ?? ""} onChange={(e) => set("departmentId", e.target.value || null)}>
              <NativeSelectOption value="">None</NativeSelectOption>
              {departments.map((d) => (
                <NativeSelectOption key={d.id} value={d.id}>
                  {d.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Trigger">
            <Input value={v.trigger ?? ""} onChange={(e) => set("trigger", e.target.value || null)} />
          </FormField>
          <FormField label="Frequency">
            <NativeSelect value={v.frequency} onChange={(e) => set("frequency", e.target.value as Initial["frequency"])}>
              <NativeSelectOption value="event_driven">When it happens</NativeSelectOption>
              <NativeSelectOption value="daily">Daily</NativeSelectOption>
              <NativeSelectOption value="weekly">Weekly</NativeSelectOption>
              <NativeSelectOption value="monthly">Monthly</NativeSelectOption>
              <NativeSelectOption value="ad_hoc">Ad hoc</NativeSelectOption>
            </NativeSelect>
          </FormField>
          <FormField label="Occurrences per month">
            <Input type="number" min={0} value={v.estimatedOccurrencesPerMonth ?? ""} onChange={(e) => set("estimatedOccurrencesPerMonth", num(e.target.value))} />
          </FormField>
          <FormField label="Minutes per occurrence" hint="Baseline for time saved">
            <Input type="number" min={0} value={v.estimatedMinutesPerOccurrence ?? ""} onChange={(e) => set("estimatedMinutesPerOccurrence", num(e.target.value))} />
          </FormField>
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
                <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-1" title="Requires judgement">
                  <Checkbox checked={Boolean(s.requiresJudgement)} onCheckedChange={(v) => setStep(i, { requiresJudgement: v === true })} aria-label="Needs judgement" />
                  <span className="sm:sr-only">Needs judgement</span>
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="justify-self-end text-muted-foreground hover:text-destructive sm:col-span-1 sm:justify-self-start"
                  aria-label={`Remove step ${i + 1}`}
                  onClick={() =>
                    set(
                      "steps",
                      v.steps.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={() => set("steps", [...v.steps, { title: "" }])}>
              Add step
            </Button>
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <TagPicker label="Systems" value={v.systems} onChange={(x) => set("systems", x)} options={systemOptions} placeholder="Another system" />
          <TagPicker label="Roles" value={v.roles} onChange={(x) => set("roles", x)} options={roleOptions} placeholder="Another role" />
        </div>
        <FormField label="Notes">
          <Textarea value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} rows={2} />
        </FormField>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
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
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          {dirty ? <span className="self-center text-xs text-muted-foreground">Unsaved changes</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
