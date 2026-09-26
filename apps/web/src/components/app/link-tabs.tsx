import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// shadcn Tabs whose triggers are links, so each tab is its own URL.
export function LinkTabs({ items }: { items: Array<{ href: string; label: string; active: boolean }> }) {
  const active = items.find((i) => i.active)?.href ?? "";
  return (
    <Tabs value={active} className="mb-4">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList>
          {items.map((t) => (
            <TabsTrigger key={t.href} value={t.href} asChild>
              <Link href={t.href}>{t.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
