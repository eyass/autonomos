"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { startPlaybookAction } from "../actions";

export function UsePlaybookForm({ id, minutes }: { id: string; minutes: number | null }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(form) =>
        start(async () => {
          const r = await startPlaybookAction(id, form);
          if (r && !r.ok) toast.error(r.error);
        })
      }
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="use-count">Times a month</Label>
          <Input id="use-count" name="occurrencesPerMonth" type="number" min={1} step="any" inputMode="decimal" required placeholder="For example 120" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="use-minutes">Minutes each time</Label>
          <Input id="use-minutes" name="minutesPerOccurrence" type="number" min={1} step="any" inputMode="decimal" required defaultValue={minutes ? Math.round(minutes) : undefined} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Your numbers set the savings estimate. The agent is tested on your systems before it can go live.</p>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? <Spinner /> : null}
        Use this playbook
      </Button>
    </form>
  );
}
