import type * as React from "react";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TONE, toneAt, type Tone } from "@/components/app/area";

// The metric card from the shadcn dashboard-01 block.
export function StatCard({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-2 py-4", className)}>
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-display text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</CardTitle>
      </CardHeader>
      {hint ? <CardFooter className="px-4 text-xs text-muted-foreground">{hint}</CardFooter> : null}
    </Card>
  );
}

// Several metrics in one compact strip: two per row on phones, one row on wide screens. Each
// tile carries a soft tint of its own colour (its `tone`, or the next in the sequence).
export function StatStrip({ items, className }: { items: Array<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone }>; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/80 bg-border/80 shadow-[0_1px_2px_rgb(18_24_22/0.04)]", items.length >= 4 ? "lg:grid-cols-4" : "sm:grid-cols-3", className)}>
      {items.map((m, i) => (
        <div key={m.label} className={cn("min-w-0 bg-card bg-gradient-to-br to-card to-70% px-4 py-4 sm:px-5", TONE[m.tone ?? toneAt(i)].tint)}>
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className={cn("size-1.5 rounded-full", TONE[m.tone ?? toneAt(i)].bar)} />
            {m.label}
          </dt>
          <dd className="mt-1 font-display text-2xl font-semibold tracking-tight tabular-nums">{m.value}</dd>
          {m.hint ? <dd className="line-clamp-2 text-xs text-muted-foreground">{m.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
