"use client";
import { useActionState } from "react";
import type { PolicyField, PolicyValues } from "@autonomos/agents";
import { setPolicyThresholdsAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The company's policy numbers for a regulated process. Required before an agent is built or goes
// live; money limits are enforced in code, the rest become the agent's rules and escalations.
export function PolicyForm({
  processId,
  fields,
  values,
  currency,
  canEdit,
}: {
  processId: string;
  fields: Array<PolicyField & { area: string }>;
  values: PolicyValues;
  currency: string;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(setPolicyThresholdsAction.bind(null, processId), null);
  const error = state && !(state as { ok: boolean }).ok ? (state as { error: string }).error : null;
  const areas = [...new Set(fields.map((f) => f.area))];
  return (
    <form action={action} className="space-y-4">
      {areas.map((area) => (
        <fieldset key={area} className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground capitalize">{area}</legend>
          {fields
            .filter((f) => f.area === area)
            .map((f) => (
              <label key={f.key} className="grid gap-1 text-sm sm:grid-cols-[1fr_12rem] sm:items-center sm:gap-3">
                <span>{f.label}</span>
                <span className="flex items-center gap-2">
                  <Input
                    name={f.key}
                    defaultValue={values[f.key] === undefined ? "" : String(values[f.key])}
                    inputMode={f.unit === "text" ? "text" : "decimal"}
                    placeholder={f.unit === "text" ? "e.g. Contract" : "0"}
                    aria-label={f.label}
                    disabled={!canEdit}
                    className="h-8"
                  />
                  <span className="w-14 shrink-0 text-xs text-muted-foreground">{f.unit === "money" ? currency : f.unit === "days" ? "days" : f.unit === "count" ? "times" : ""}</span>
                </span>
              </label>
            ))}
        </fieldset>
      ))}
      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {pending ? "Saving…" : "Save policy"}
          </Button>
          {error ? <span className="text-xs text-destructive">{error}</span> : state ? <span className="text-xs text-muted-foreground">Saved</span> : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Only admins can change these.</p>
      )}
    </form>
  );
}
