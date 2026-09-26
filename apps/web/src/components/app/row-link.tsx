import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";

// A tappable list row built on the shadcn Item component. Use inside an ItemGroup.
export function RowLink({ href, title, meta, aside }: { href: string; title: React.ReactNode; meta?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <Item asChild size="sm" className="rounded-none px-4 sm:px-6">
      <Link href={href}>
        <ItemContent className="min-w-0">
          <ItemTitle className="w-full truncate">{title}</ItemTitle>
          {meta ? <ItemDescription className="meta-dots flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">{meta}</ItemDescription> : null}
        </ItemContent>
        <ItemActions>
          {aside}
          <ChevronRight className="size-4 text-muted-foreground" />
        </ItemActions>
      </Link>
    </Item>
  );
}
