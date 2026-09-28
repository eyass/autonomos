"use client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ActionButton } from "@/components/action-button";
import { requestJob } from "@/components/app/job";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { deletePlaybookAction, savePlaybookAction, setPlaybookStatusAction } from "../actions";

type Step = { title: string; detail: string; capability: string | null; access: "read" | "write" | "none" };
type Initial = {
  title: string;
  summary: string;
  department: string;
  trigger: string;
  steps: Step[];
  estimatedMinutes: string;
  objective: string;
  rules: string;
  escalations: string;
  autonomyLevel: number;
};

const LEVELS = [
  { value: 2, label: "2 · Drafts the work for a person to send" },
  { value: 3, label: "3 · Proposes each action for approval" },
  { value: 4, label: "4 · Acts on routine cases, asks on the rest" },
];

export function PlaybookEditor({ id, initial, departments, capabilities }: { id: string; initial: Initial; departments: readonly string[]; capabilities: Array<{ key: string; label: string }> }) {
  const [pending, start] = useTransition();
  const [steps, setSteps] = useState<Step[]>(initial.steps);
  const router = useRouter();
  const set = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) =>
    setSteps((s) => {
      const next = [...s];
      const [x] = next.splice(i, 1);
      next.splice(Math.max(0, Math.min(next.length, i + by)), 0, x!);
      return next;
    });
  const save = (form: FormData) =>
    start(async () => {
      const r = await savePlaybookAction(id, { ...Object.fromEntries(form), steps });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Saved");
      router.refresh();
    });
  const field = (name: Exclude<keyof Initial, "steps">, label: string, hint?: string, rows?: number) => (
    <div className="space-y-1.5">
      <Label htmlFor={`pb-${name}`}>{label}</Label>
      {rows ? <Textarea id={`pb-${name}`} name={name} defaultValue={String(initial[name])} rows={rows} /> : <Input id={`pb-${name}`} name={name} defaultValue={String(initial[name])} />}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
  return (
    <form action={save} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="gap-4 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
          <h2 className="text-sm font-semibold">The process</h2>
          {field("title", "Title")}
          {field("summary", "Summary", "One sentence on what it does and why it is worth it.", 2)}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pb-department">Department</Label>
              <NativeSelect id="pb-department" name="department" defaultValue={initial.department}>
                {departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </NativeSelect>
            </div>
            {field("estimatedMinutes", "Minutes each time", "What a person typically spends.")}
          </div>
          {field("trigger", "What starts it")}
        </Card>
        <Card className="gap-4 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
          <h2 className="text-sm font-semibold">The agent</h2>
          {field("objective", "Objective", undefined, 3)}
          {field("rules", "Rules", "One per line. Never name a product.", 4)}
          {field("escalations", "Hand to a person when", "One per line.", 3)}
          <div className="space-y-1.5">
            <Label htmlFor="pb-level">Autonomy</Label>
            <NativeSelect id="pb-level" name="autonomyLevel" defaultValue={String(initial.autonomyLevel)}>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </Card>
      </div>
      <Card className="gap-3 px-4 py-4 sm:gap-3 sm:px-6 sm:py-5">
        <div>
          <h2 className="text-sm font-semibold">Steps</h2>
          <p className="text-xs text-muted-foreground">Each step names the kind of system it works in. Customers connect their own tool to it.</p>
        </div>
        <ol className="space-y-3" aria-label="Steps">
          {steps.map((s, i) => (
            <li key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1.5rem_minmax(0,1fr)_11rem_8rem_auto] sm:items-start" data-testid="step-row">
              <span className="pt-2 text-xs font-medium text-muted-foreground tabular-nums">{i + 1}</span>
              <div className="space-y-2">
                <Input aria-label={`Step ${i + 1} title`} value={s.title} onChange={(e) => set(i, { title: e.target.value })} />
                <Input aria-label={`Step ${i + 1} detail`} value={s.detail} placeholder="What to look at or do" onChange={(e) => set(i, { detail: e.target.value })} className="text-xs" />
              </div>
              <NativeSelect
                aria-label={`Step ${i + 1} system`}
                value={s.capability ?? ""}
                onChange={(e) => set(i, { capability: e.target.value || null, access: e.target.value ? (s.access === "none" ? "read" : s.access) : "none" })}
              >
                <option value="">No system</option>
                {capabilities.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect aria-label={`Step ${i + 1} access`} value={s.access} disabled={!s.capability} onChange={(e) => set(i, { access: e.target.value as Step["access"] })}>
                {s.capability ? null : <option value="none">Decides</option>}
                <option value="read">Looks up</option>
                <option value="write">Changes</option>
              </NativeSelect>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove step" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ol>
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setSteps((x) => [...x, { title: "", detail: "", capability: null, access: "none" }])}>
          <Plus />
          Add step
        </Button>
      </Card>
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner /> : null}
        Save changes
      </Button>
    </form>
  );
}

export function PlaybookStatus({ id, status, department }: { id: string; status: "draft" | "published"; department: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await requestJob("playbook", { department });
            if (!r.ok) return void toast.error(r.error);
            toast.success(`Drafting another for ${department}.`);
            router.push("/admin/playbooks");
          })
        }
      >
        {pending ? <Spinner /> : null}
        Draft another
      </Button>
      <ActionButton
        variant="outline"
        action={deletePlaybookAction.bind(null, id)}
        confirm="Delete this playbook?"
        confirmDetail="Agents already built from it are not affected."
        onDone={() => router.push("/admin/playbooks")}
      >
        Delete
      </ActionButton>
      {status === "published" ? (
        <ActionButton variant="outline" action={setPlaybookStatusAction.bind(null, id, "draft")}>
          Unpublish
        </ActionButton>
      ) : (
        <ActionButton action={setPlaybookStatusAction.bind(null, id, "published")}>Publish</ActionButton>
      )}
    </>
  );
}
