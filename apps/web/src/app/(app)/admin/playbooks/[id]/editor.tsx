"use client";
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

type Initial = {
  title: string;
  summary: string;
  department: string;
  trigger: string;
  steps: string;
  estimatedMinutes: string;
  objective: string;
  rules: string;
  escalations: string;
  tools: string[];
  autonomyLevel: number;
};
type Tool = { key: string; label: string; integration: string; system: string; access: "read" | "write" };

const LEVELS = [
  { value: 2, label: "2 · Drafts the work for a person to send" },
  { value: 3, label: "3 · Proposes each action for approval" },
  { value: 4, label: "4 · Acts on routine cases, asks on the rest" },
];

export function PlaybookEditor({ id, initial, tools, departments }: { id: string; initial: Initial; tools: Tool[]; departments: string[] }) {
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState(new Set(initial.tools));
  const router = useRouter();
  const systems = [...new Set(tools.map((t) => t.system))];
  const save = (form: FormData) =>
    start(async () => {
      const r = await savePlaybookAction(id, form);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Saved");
      router.refresh();
    });
  const field = (name: keyof Initial, label: string, hint?: string, rows?: number) => (
    <div className="space-y-1.5">
      <Label htmlFor={`pb-${name}`}>{label}</Label>
      {rows ? <Textarea id={`pb-${name}`} name={name} defaultValue={String(initial[name])} rows={rows} /> : <Input id={`pb-${name}`} name={name} defaultValue={String(initial[name])} />}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
  return (
    <form action={save} className="grid gap-6 lg:grid-cols-2">
      <Card className="gap-4 px-4 py-4 sm:gap-4 sm:py-4 sm:px-6">
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
          {field("estimatedMinutes", "Minutes each time", "What a person spends today.")}
        </div>
        {field("trigger", "What starts it")}
        {field("steps", "Steps", "One per line, as a person does it today.", 6)}
      </Card>
      <Card className="gap-4 px-4 py-4 sm:gap-4 sm:py-4 sm:px-6">
        <h2 className="text-sm font-semibold">The agent</h2>
        {field("objective", "Objective", undefined, 3)}
        {field("rules", "Rules", "One per line.", 4)}
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
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Actions ({chosen.size})</legend>
          {systems.map((s) => (
            <div key={s} className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">{s}</div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {tools
                  .filter((t) => t.system === s)
                  .map((t) => (
                    <label key={t.key} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="tools"
                        value={t.key}
                        checked={chosen.has(t.key)}
                        onChange={(e) => {
                          const next = new Set(chosen);
                          if (e.target.checked) next.add(t.key);
                          else next.delete(t.key);
                          setChosen(next);
                        }}
                        className="mt-0.5 size-4 accent-[var(--brand)]"
                      />
                      <span className="min-w-0">
                        {t.label} <span className="text-xs text-muted-foreground">{t.access === "read" ? "reads" : "acts"}</span>
                      </span>
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </fieldset>
      </Card>
      <div className="lg:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : null}
          Save changes
        </Button>
      </div>
    </form>
  );
}

export function PlaybookStatus({ id, status, firstToolkit }: { id: string; status: "draft" | "published"; firstToolkit: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        variant="outline"
        disabled={pending || !firstToolkit}
        onClick={() =>
          start(async () => {
            const r = await requestJob("playbook", { toolkit: firstToolkit });
            if (!r.ok) return void toast.error(r.error);
            toast.success("Drafting another for this tool.");
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
