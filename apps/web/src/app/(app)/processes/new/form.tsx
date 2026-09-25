"use client";
import { useActionState } from "react";
import { Button, Card, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { createProcessAction } from "../actions";

export function NewProcessForm({ departments }: { departments: string[] }) {
  const [state, action, pending] = useActionState(createProcessAction, null);
  return (
    <Card className="max-w-2xl p-6">
      <form action={action} className="space-y-4">
        <Field label="Name" htmlFor="title">
          <Input id="title" name="title" required placeholder="Refund request handling" />
        </Field>
        <Field label="Description" htmlFor="description" hint="What happens, who does it, and which systems are involved.">
          <Textarea id="description" name="description" required rows={4} />
        </Field>
        <Field label="Department" htmlFor="department">
          <Select id="department" name="department" defaultValue={departments[0] ?? "Operations"}>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="generate" defaultChecked className="accent-[var(--accent)]" /> Generate the workflow steps with AI (you review them next)
        </label>
        {state && !state.ok ? <Notice tone="danger">{state.error}</Notice> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Add process"}
        </Button>
      </form>
    </Card>
  );
}
