import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Page-level tabs: a line under the row, the active tab marked in signal orange.
export const LINE_TAB = "flex-none px-0.5 text-muted-foreground after:bg-highlight hover:text-foreground data-[state=active]:font-semibold data-[state=active]:text-foreground group-data-[orientation=horizontal]/tabs:after:bottom-[-1px]";

// shadcn Tabs whose triggers are links, so each tab is its own URL.
export function LinkTabs({ items }: { items: Array<{ href: string; label: string; active: boolean }> }) {
  const active = items.find((i) => i.active)?.href ?? "";
  return (
    <Tabs value={active} className="mb-6">
      <div className="-mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        <TabsList variant="line" className="h-10 gap-5">
          {items.map((t) => (
            <TabsTrigger
              key={t.href}
              value={t.href}
              asChild
              className={LINE_TAB}
            >
              <Link href={t.href}>{t.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
