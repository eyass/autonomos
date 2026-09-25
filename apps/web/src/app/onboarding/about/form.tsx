"use client";
import { DEPARTMENTS } from "@autonomos/schemas";
import { useActionState } from "react";
import { Button, Card, Field, Notice, Textarea } from "@/components/ui";
import { saveAboutAction } from "../actions";

export function AboutForm({ summary, areas }: { summary: string; areas: string[] }) {
  const [state, action, pending] = useActionState(saveAboutAction, null);
  return (
    <Card className="p-6">
      <form action={action} className="space-y-5">
        <Field label="What does your company do?" htmlFor="summary">
          <Textarea id="summary" name="summary" rows={4} defaultValue={summary} required placeholder="We run an online marketplace for…" />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Which areas would you like to improve with AI?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DEPARTMENTS.map((d) => (
              <label key={d} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input type="checkbox" name="areas" value={d} defaultChecked={areas.includes(d)} className="accent-[var(--accent)]" />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
        {state && !state.ok ? <Notice tone="danger">{state.error}</Notice> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Continue"}
        </Button>
      </form>
    </Card>
  );
}
