"use client";
import { EMPLOYEE_COUNTS, INDUSTRIES } from "@autonomos/schemas";
import { useActionState } from "react";
import { Button, Card, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { createCompanyAction } from "../actions";

export function CompanyForm() {
  const [state, action, pending] = useActionState(createCompanyAction, null);
  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        <Field label="Company name" htmlFor="name">
          <Input id="name" name="name" required maxLength={120} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Website" htmlFor="website">
            <Input id="website" name="website" placeholder="https://" />
          </Field>
          <Field label="Industry" htmlFor="industry">
            <Select id="industry" name="industry" defaultValue="">
              <option value="">Select…</option>
              {INDUSTRIES.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </Select>
          </Field>
          <Field label="Number of employees" htmlFor="employeeCount">
            <Select id="employeeCount" name="employeeCount" defaultValue="">
              <option value="">Select…</option>
              {EMPLOYEE_COUNTS.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </Select>
          </Field>
          <Field label="Country" htmlFor="country">
            <Input id="country" name="country" />
          </Field>
        </div>
        <Field label="Short description" htmlFor="description">
          <Textarea id="description" name="description" rows={3} />
        </Field>
        {state && !state.ok ? <Notice tone="danger">{state.error}</Notice> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create company"}
        </Button>
      </form>
    </Card>
  );
}
