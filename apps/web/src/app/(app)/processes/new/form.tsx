"use client";
import { useActionState } from "react";
import { createProcessAction } from "../actions";
import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

export function NewProcessForm({ departments }: { departments: string[] }) {
  const [state, action, pending] = useActionState(createProcessAction, null);
  return (
    <Card className="max-w-2xl p-6">
      <form action={action} className="space-y-4">
        <FormField label="Name" htmlFor="title">
          <Input id="title" name="title" required placeholder="Refund request handling" />
        </FormField>
        <FormField label="Description" htmlFor="description" hint="What happens, who does it, and which systems are involved.">
          <Textarea id="description" name="description" required rows={4} />
        </FormField>
        <FormField label="Department" htmlFor="department">
          <NativeSelect id="department" name="department" defaultValue="Detect">
            <NativeSelectOption value="Detect">Let AutonomOS decide</NativeSelectOption>
            {departments.map((d) => (
              <NativeSelectOption key={d}>{d}</NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <Field orientation="horizontal">
          <Checkbox id="generate" name="generate" defaultChecked />
          <FieldLabel htmlFor="generate" className="font-normal">
            Generate the workflow steps with AI (you review them next)
          </FieldLabel>
        </Field>
        {state && !state.ok ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Add process"}
        </Button>
      </form>
    </Card>
  );
}
