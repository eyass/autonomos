"use client";
import { EMPLOYEE_COUNTS, INDUSTRIES } from "@autonomos/schemas";
import { useActionState } from "react";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { inviteAction, saveDepartmentAction, updateCompanyAction } from "./actions";

type R = { ok: true } | { ok: false; error: string } | null;
const Result = ({ state, success }: { state: unknown; success: string }) => {
  const s = state as R;
  if (!s) return null;
  return s.ok ? <Notice tone="ok">{success}</Notice> : <Notice tone="danger">{s.error}</Notice>;
};

export function CompanyForm({ org, disabled }: { org: { name: string; industry: string | null; website: string | null; employeeCount: string | null; defaultHourlyCost: number; currency: string }; disabled: boolean }) {
  const [state, action, pending] = useActionState(updateCompanyAction, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Name">
        <Input name="name" defaultValue={org.name} disabled={disabled} required />
      </Field>
      <Field label="Industry">
        <Select name="industry" defaultValue={org.industry ?? ""} disabled={disabled}>
          <option value="">–</option>
          {INDUSTRIES.map((i) => (
            <option key={i}>{i}</option>
          ))}
        </Select>
      </Field>
      <Field label="Website">
        <Input name="website" defaultValue={org.website ?? ""} disabled={disabled} />
      </Field>
      <Field label="Employees">
        <Select name="employeeCount" defaultValue={org.employeeCount ?? ""} disabled={disabled}>
          <option value="">–</option>
          {EMPLOYEE_COUNTS.map((i) => (
            <option key={i}>{i}</option>
          ))}
        </Select>
      </Field>
      <Field label={`Default hourly labour cost (${org.currency})`} hint="Used for estimated value. Override per department below.">
        <Input name="defaultHourlyCost" type="number" min={1} step="0.01" defaultValue={org.defaultHourlyCost} disabled={disabled} />
      </Field>
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
      <Input name="hourlyLabourCost" type="number" min={1} step="0.01" defaultValue={dept?.hourly_labour_cost ?? ""} placeholder="Cost / hour" aria-label="Hourly cost" className="sm:w-32" disabled={disabled} />
      <div className="col-span-2 flex items-center gap-1 sm:col-span-1">
        <Button size="sm" variant="secondary" type="submit" disabled={disabled || pending}>
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
      <Select name="role" aria-label="Role" className="sm:w-32" disabled={disabled}>
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </Select>
      <Button type="submit" className="h-10 sm:h-8" disabled={disabled || pending}>
        Invite
      </Button>
      <div className="col-span-2 sm:w-full">
        <Result state={state} success="Invite saved. They join when they sign up with this email." />
      </div>
    </form>
  );
}
