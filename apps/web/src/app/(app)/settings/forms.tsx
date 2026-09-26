"use client";
import { EMPLOYEE_COUNTS, INDUSTRIES } from "@autonomos/schemas";
import { useActionState } from "react";
import { inviteAction, saveDepartmentAction, updateCompanyAction } from "./actions";
import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type R = { ok: true } | { ok: false; error: string } | null;
const Result = ({ state, success }: { state: unknown; success: string }) => {
  const s = state as R;
  if (!s) return null;
  return s.ok ? (
    <Alert variant="success">
      <AlertDescription>{success}</AlertDescription>
    </Alert>
  ) : (
    <Alert variant="destructive">
      <AlertDescription>{s.error}</AlertDescription>
    </Alert>
  );
};

export function CompanyForm({
  org,
  disabled,
}: {
  org: { name: string; industry: string | null; website: string | null; employeeCount: string | null; defaultHourlyCost: number; currency: string };
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(updateCompanyAction, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <FormField label="Name">
        <Input name="name" defaultValue={org.name} disabled={disabled} required />
      </FormField>
      <FormField label="Industry">
        <NativeSelect name="industry" defaultValue={org.industry ?? ""} disabled={disabled}>
          <NativeSelectOption value="">–</NativeSelectOption>
          {INDUSTRIES.map((i) => (
            <NativeSelectOption key={i}>{i}</NativeSelectOption>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Website">
        <Input name="website" defaultValue={org.website ?? ""} disabled={disabled} />
      </FormField>
      <FormField label="Employees">
        <NativeSelect name="employeeCount" defaultValue={org.employeeCount ?? ""} disabled={disabled}>
          <NativeSelectOption value="">–</NativeSelectOption>
          {EMPLOYEE_COUNTS.map((i) => (
            <NativeSelectOption key={i}>{i}</NativeSelectOption>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label={`Default hourly labour cost (${org.currency})`} hint="Used for estimated value. Override per department below.">
        <Input name="defaultHourlyCost" type="number" min={1} step="0.01" defaultValue={org.defaultHourlyCost} disabled={disabled} />
      </FormField>
      <div className="flex items-end">
        <Button type="submit" disabled={disabled || pending}>
          Save
        </Button>
      </div>
      <div className="sm:col-span-2">
        <Result state={state} success="Saved" />
      </div>
    </form>
  );
}

export function DepartmentForm({ dept, disabled, extra }: { dept?: { id: string; name: string; hourly_labour_cost: number | null }; disabled: boolean; extra?: React.ReactNode }) {
  const [state, action, pending] = useActionState(saveDepartmentAction, null);
  return (
    <form action={action} className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2 sm:flex sm:flex-wrap sm:items-center">
      {dept ? <input type="hidden" name="id" value={dept.id} /> : null}
      <Input name="name" defaultValue={dept?.name} placeholder="Department" aria-label="Department name" className="sm:w-48" disabled={disabled} required />
      <Input
        name="hourlyLabourCost"
        type="number"
        min={1}
        step="0.01"
        defaultValue={dept?.hourly_labour_cost ?? ""}
        placeholder="Cost / hour"
        aria-label="Hourly cost"
        className="sm:w-32"
        disabled={disabled}
      />
      <div className="col-span-2 flex items-center gap-1 sm:col-span-1">
        <Button size="sm" variant="outline" type="submit" disabled={disabled || pending}>
          {dept ? "Save" : "Add department"}
        </Button>
        {extra}
      </div>
      <div className="col-span-2 sm:col-span-1">
        <Result state={state} success="Saved" />
      </div>
    </form>
  );
}

export function InviteForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState(inviteAction, null);
  return (
    <form action={action} className="grid grid-cols-[1fr_7rem] gap-2 sm:flex sm:flex-wrap sm:items-center">
      <Input name="email" type="email" placeholder="colleague@company.com" aria-label="Email" className="col-span-2 sm:w-64" disabled={disabled} required />
      <NativeSelect name="role" aria-label="Role" className="sm:w-32" disabled={disabled}>
        <NativeSelectOption value="member">Member</NativeSelectOption>
        <NativeSelectOption value="admin">Admin</NativeSelectOption>
      </NativeSelect>
      <Button type="submit" className="h-10 sm:h-8" disabled={disabled || pending}>
        Invite
      </Button>
      <div className="col-span-2 sm:w-full">
        <Result state={state} success="Invite saved. They join when they sign up with this email." />
      </div>
    </form>
  );
}
