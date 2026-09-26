"use client";
import { EMPLOYEE_COUNTS, INDUSTRIES } from "@autonomos/schemas";
import { useActionState, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { createApiKeyAction, inviteAction, saveDepartmentAction, setApprovalLimitAction, setPausedAction, updateCompanyAction, updateProfileAction } from "./actions";
import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  org: { name: string; industry: string | null; website: string | null; employeeCount: string | null; defaultHourlyCost: number; currency: string; companySummary: string | null };
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
      <div className="sm:col-span-2">
        <FormField label="What the company does" hint="Used as context for discovery and by every agent.">
          <Textarea name="summary" rows={3} defaultValue={org.companySummary ?? ""} disabled={disabled} />
        </FormField>
      </div>
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

// Emergency stop with an optional end time. Confirmation happens in the AlertDialog.
export function PauseControl({ paused, until }: { paused: boolean; until: string | null }) {
  const [hours, setHours] = useState<string>("");
  if (paused) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-warning">
          {until
            ? `Paused until ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(until))}. Agents resume on their own after that.`
            : "Paused until an admin resumes."}
        </p>
        <ActionButton action={setPausedAction.bind(null, false, null)}>Resume all agents</ActionButton>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <NativeSelect aria-label="Pause for" value={hours} onChange={(e) => setHours(e.target.value)} className="sm:w-56">
        <NativeSelectOption value="">Until I resume</NativeSelectOption>
        <NativeSelectOption value="1">For 1 hour</NativeSelectOption>
        <NativeSelectOption value="4">For 4 hours</NativeSelectOption>
        <NativeSelectOption value="24">For 24 hours</NativeSelectOption>
        <NativeSelectOption value="168">For a week</NativeSelectOption>
      </NativeSelect>
      <ActionButton variant="destructive" confirm="Pause every agent in the organisation now?" confirmLabel="Pause all agents" action={setPausedAction.bind(null, true, hours ? Number(hours) : null)}>
        Pause all agents
      </ActionButton>
    </div>
  );
}

export function ProfileForm({ firstName, lastName, prefs }: { firstName: string; lastName: string; prefs: { approvals: boolean; failures: boolean; weekly_summary: boolean } }) {
  const [state, action, pending] = useActionState(updateProfileAction, null);
  const pref = (name: string, label: string, hint: string, checked: boolean) => (
    <Field orientation="horizontal">
      <Checkbox id={`pref-${name}`} name={name} defaultChecked={checked} />
      <FieldContent>
        <FieldLabel htmlFor={`pref-${name}`}>{label}</FieldLabel>
        <FieldDescription>{hint}</FieldDescription>
      </FieldContent>
    </Field>
  );
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="First name">
          <Input name="firstName" defaultValue={firstName} required />
        </FormField>
        <FormField label="Last name">
          <Input name="lastName" defaultValue={lastName} required />
        </FormField>
      </div>
      <FieldSet>
        <FieldLegend variant="label">Email me when</FieldLegend>
        <FieldGroup className="gap-3">
          {pref("approvals", "An action needs my approval", "Only if you can approve actions.", prefs.approvals)}
          {pref("failures", "An agent fails or hands work to a person", "Sent to owners and admins.", prefs.failures)}
          {pref("weeklySummary", "Weekly summary", "What agents did, time saved and cost.", prefs.weekly_summary)}
        </FieldGroup>
      </FieldSet>
      <p className="text-xs text-muted-foreground">In-app notifications always appear.</p>
      <Button type="submit" disabled={pending}>
        Save
      </Button>
      <Result state={state} success="Saved" />
    </form>
  );
}

// Creates an API key and shows it once. Only the hash is stored.
export function ApiKeyForm() {
  const [state, action, pending] = useActionState(createApiKeyAction, null);
  const created = state && (state as { ok: boolean }).ok ? (state as { ok: true; data: { key: string } }).data.key : null;
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input name="name" placeholder="Key name, for example Zapier" aria-label="Key name" className="sm:w-64" required />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Creating…" : "Create API key"}
        </Button>
      </div>
      {created ? (
        <Alert variant="success">
          <AlertDescription className="space-y-1">
            <span className="block">Copy this key now. It is not shown again.</span>
            <code className="block break-all rounded bg-background px-2 py-1 text-xs">{created}</code>
          </AlertDescription>
        </Alert>
      ) : state && !(state as { ok: boolean }).ok ? (
        <Result state={state} success="" />
      ) : null}
    </form>
  );
}

export function ApprovalLimitForm({ userId, limit, currency }: { userId: string; limit: number | null; currency: string }) {
  const [state, action, pending] = useActionState(setApprovalLimitAction, null);
  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="userId" value={userId} />
      <Input name="limit" type="number" min={0} step="1" defaultValue={limit ?? ""} placeholder="No limit" aria-label={`Approval limit (${currency})`} className="h-8 w-28" />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        Set limit
      </Button>
      {state && !(state as { ok: boolean }).ok ? <span className="text-xs text-destructive">{(state as { error: string }).error}</span> : null}
    </form>
  );
}
