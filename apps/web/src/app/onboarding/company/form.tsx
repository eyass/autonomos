"use client";
import { EMPLOYEE_COUNTS, INDUSTRIES } from "@autonomos/schemas";
import { useActionState } from "react";
import { createCompanyAction } from "../actions";
import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

export function CompanyForm() {
  const [state, action, pending] = useActionState(createCompanyAction, null);
  return (
    <Card>
      <CardContent>
        <form action={action} className="space-y-4">
          <FormField label="Company name" htmlFor="name">
            <Input id="name" name="name" required maxLength={120} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Website" htmlFor="website">
              <Input id="website" name="website" placeholder="https://" />
            </FormField>
            <FormField label="Industry" htmlFor="industry">
              <NativeSelect id="industry" name="industry" defaultValue="">
                <NativeSelectOption value="">Select…</NativeSelectOption>
                {INDUSTRIES.map((i) => (
                  <NativeSelectOption key={i}>{i}</NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Number of employees" htmlFor="employeeCount">
              <NativeSelect id="employeeCount" name="employeeCount" defaultValue="">
                <NativeSelectOption value="">Select…</NativeSelectOption>
                {EMPLOYEE_COUNTS.map((i) => (
                  <NativeSelectOption key={i}>{i}</NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Country" htmlFor="country">
              <Input id="country" name="country" />
            </FormField>
          </div>
          <FormField label="Short description" htmlFor="description">
            <Textarea id="description" name="description" rows={3} />
          </FormField>
          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create company"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
