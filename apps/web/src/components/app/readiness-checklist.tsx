import { CircleAlert, CircleCheck, CircleDashed } from "lucide-react";
import Link from "next/link";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import type { ReadinessCheck } from "@/server/readiness";

// A plain checklist: what is ready, what is not, and where to fix it.
export function ReadinessChecklist({ checks }: { checks: ReadinessCheck[] }) {
  return (
    <ItemGroup>
      {checks.map((c) => (
        <Item key={c.key} size="sm" className="px-0">
          <ItemMedia>
            {c.ok ? <CircleCheck className="size-4 text-success" /> : c.blocking ? <CircleAlert className="size-4 text-destructive" /> : <CircleDashed className="size-4 text-warning" />}
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{c.label}</ItemTitle>
            <ItemDescription>{c.detail}</ItemDescription>
          </ItemContent>
          {!c.ok && c.href ? (
            <ItemActions>
              <Link href={c.href} className="text-xs font-medium text-primary hover:underline">
                Fix
              </Link>
            </ItemActions>
          ) : null}
        </Item>
      ))}
    </ItemGroup>
  );
}
