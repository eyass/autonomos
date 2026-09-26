import type * as React from "react";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// The metric card from the shadcn dashboard-01 block.
export function StatCard({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-2 py-4", className)}>
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint ? <CardFooter className="px-4 text-xs text-muted-foreground">{hint}</CardFooter> : null}
    </Card>
  );
}
