"use client";
import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./ui";

// A GET form that keeps secondary filters behind a toggle. Changing a select applies it
// immediately; text fields apply on Enter. Hidden filters are still submitted.
export function FilterBar({ children, more, activeCount, clearHref, className }: { children?: React.ReactNode; more?: React.ReactNode; activeCount: number; clearHref: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <form
      method="get"
      className={cn("space-y-2", className)}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === "date")) e.currentTarget.requestSubmit();
      }}
    >
      <div className="flex gap-2">
        {children}
        {more ? (
          <Button type="button" variant="secondary" className="h-10 shrink-0 sm:h-9" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <SlidersHorizontal size={14} />
            <span>Filters{activeCount ? ` · ${activeCount}` : ""}</span>
          </Button>
        ) : null}
        <button type="submit" className="sr-only">
          Apply
        </button>
      </div>
      {more ? (
        <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6", !open && "hidden")}>
          {more}
          {activeCount ? (
            <Link href={clearHref} className="flex h-10 items-center text-sm text-muted hover:text-foreground sm:h-9">
              Clear filters
            </Link>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
