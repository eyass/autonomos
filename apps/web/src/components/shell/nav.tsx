"use client";
import { Activity, Bot, CheckCircle2, LayoutDashboard, Lightbulb, Plug, Settings, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/processes", label: "Processes", icon: Workflow },
  { href: "/opportunities", label: "Opportunities", icon: Lightbulb },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/approvals", label: "Approvals", icon: CheckCircle2 },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav({ pendingApprovals }: { pendingApprovals: number }) {
  const path = usePathname();
  return (
    <nav className="space-y-0.5">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`) || (href === "/processes" && path.startsWith("/discover"));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
              active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <Icon size={16} />
            <span className="flex-1">{label}</span>
            {href === "/approvals" && pendingApprovals > 0 ? (
              <span className="rounded-full bg-warn px-1.5 text-[11px] font-semibold text-white tabular-nums">{pendingApprovals}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
