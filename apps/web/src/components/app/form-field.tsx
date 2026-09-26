import * as React from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

// shadcn Field with a label that is always tied to its control.
export function FormField({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactElement<{ id?: string }>; htmlFor?: string }) {
  const generated = React.useId();
  const id = htmlFor ?? children.props.id ?? generated;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children.props.id ? children : React.cloneElement(children, { id })}
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}
