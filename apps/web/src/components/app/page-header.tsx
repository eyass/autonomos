import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// `icon` marks what the page is about (an agent, a process, an idea, a run) with a tile beside
// the title; `tone="agent"` lights it in signal orange while an agent is working.
export function PageHeader({
  title,
  description,
  actions,
  back,
  icon: Icon,
  tone = "brand",
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  icon?: LucideIcon;
  tone?: "brand" | "agent";
}) {
  return (
    <div className="mb-8">
      {back ? (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {Icon ? (
            <span
              aria-hidden
              className={cn(
                "mt-0.5 hidden size-12 shrink-0 items-center justify-center rounded-2xl border shadow-sm sm:flex",
                tone === "agent" ? "border-highlight/25 bg-highlight-soft text-highlight-strong" : "border-brand/15 bg-brand-soft text-brand",
              )}
            >
              <Icon className="size-5" />
            </span>
          ) : null}
          <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] break-words sm:text-[1.875rem] sm:leading-tight">{title}</h1>
          {description ? <div className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-[15px]">{description}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
