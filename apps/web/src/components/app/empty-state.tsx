import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { LevelMeter } from "@/components/brand/logo";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

// An empty list: what will show here and how to fill it. The mark is the page's icon, or the
// autonomy scale when a page has none.
export function EmptyState({ title, description, action, icon: Icon }: { title: string; description?: string; action?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <Empty className="rounded-2xl border border-border/80 bg-card bg-grid-light py-14 md:py-16">
      <EmptyHeader>
        <EmptyMedia className="mb-3 size-12 rounded-2xl border border-brand/15 bg-brand-soft text-brand shadow-sm">
          {Icon ? <Icon className="size-5" aria-hidden /> : <LevelMeter level={3} className="h-5" />}
        </EmptyMedia>
        <EmptyTitle className="text-base font-semibold">{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
