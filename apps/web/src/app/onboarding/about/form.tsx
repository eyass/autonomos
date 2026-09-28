"use client";
import { DEPARTMENTS } from "@autonomos/schemas";
import { useActionState } from "react";
import { saveAboutAction } from "../actions";
import { BottomBar } from "../bottom-bar";
import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export function AboutForm({ summary, areas }: { summary: string; areas: string[] }) {
  const [state, action, pending] = useActionState(saveAboutAction, null);
  return (
    <Card>
      <CardContent>
        <form action={action} className="space-y-6">
          <FormField label="What does your company do?" htmlFor="summary">
            <Textarea id="summary" name="summary" rows={4} defaultValue={summary} required placeholder="We run an online marketplace for…" />
          </FormField>
          <FieldSet>
            <FieldLegend variant="label">Which areas would you like to improve with AI?</FieldLegend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DEPARTMENTS.map((d) => (
                <FieldLabel key={d} htmlFor={`area-${d}`}>
                  <Field orientation="horizontal" className="p-3!">
                    <Checkbox id={`area-${d}`} name="areas" value={d} defaultChecked={areas.includes(d)} />
                    <FieldContent>
                      <FieldTitle>{d}</FieldTitle>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              ))}
            </div>
          </FieldSet>
          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <BottomBar>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Continue"}
            </Button>
          </BottomBar>
        </form>
      </CardContent>
    </Card>
  );
}
