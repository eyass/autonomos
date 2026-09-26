"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export function DocsNav({ items }: { items: Array<{ href: string; title: string }> }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = items.find((i) => i.href === pathname)?.href ?? items[0]?.href;
  return (
    <>
      <div className="lg:hidden">
        <label htmlFor="docs-page" className="mb-1 block text-xs font-medium text-muted-foreground">
          Documentation
        </label>
        <NativeSelect id="docs-page" value={current} onChange={(e) => router.push(e.target.value)}>
          {items.map((i) => (
            <NativeSelectOption key={i.href} value={i.href}>
              {i.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <nav aria-label="Documentation" className="hidden lg:block">
        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Documentation</p>
        <ul className="space-y-0.5">
          {items.map((i) => (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={i.href === current ? "page" : undefined}
                className={cn("block rounded-md px-3 py-1.5 text-sm", i.href === current ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
              >
                {i.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
