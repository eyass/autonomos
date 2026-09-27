"use client";
import { ChevronDown } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// A settings card that collapses on phones (closed by default, so the page is a scannable
// list) and is always open from md up.
export function SettingsSection({
  id,
  title,
  description,
  action,
  children,
  defaultOpen = false,
  tone,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  tone?: "warning" | "danger";
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Jump-list links and deep links (/settings#members) open the section they point at.
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    const t = setTimeout(sync, 0);
    window.addEventListener("hashchange", sync);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", sync);
    };
  }, [id]);
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Card id={id} className={cn("scroll-mt-20", tone === "warning" && "border-warning", tone === "danger" && "border-destructive/50")}>
        <CardHeader>
          {/* On phones the action sits under the description so long labels never push the card wider than the screen. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 space-y-1.5">
              <CollapsibleTrigger className="group flex items-center gap-2 text-left md:pointer-events-none">
                <CardTitle>{title}</CardTitle>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 md:hidden" />
              </CollapsibleTrigger>
              {description ? <CardDescription>{description}</CardDescription> : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        </CardHeader>
        <CollapsibleContent forceMount className="data-[state=closed]:hidden md:data-[state=closed]:block">
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
