import type * as React from "react";
import { cn } from "@/lib/utils";

export function DefinitionList({ items, className }: { items: Array<{ label: string; value: React.ReactNode }>; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3", className)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
