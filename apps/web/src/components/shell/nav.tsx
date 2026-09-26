"use client";
import { Activity, Bot, CheckCircle2, LayoutDashboard, Lightbulb, Menu, Plug, Settings, Workflow, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/approvals", label: "Approvals", icon: CheckCircle2 },
  { href: "/processes", label: "Processes", icon: Workflow },
  { href: "/opportunities", label: "Opportunities", icon: Lightbulb },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/activity", label: "Activity", icon: Activity },
];
const SECONDARY = [
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`) || (href === "/processes" && path.startsWith("/discover"));
}

export function Nav({ pendingApprovals }: { pendingApprovals: number }) {
  const path = usePathname();
  const link = ({ href, label, icon: Icon }: (typeof ITEMS)[number]) => (
    <Link
      key={href}
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
        isActive(path, href) ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      <Icon size={16} />
      <span className="flex-1">{label}</span>
      {href === "/approvals" && pendingApprovals > 0 ? (
        <span className="rounded-full bg-warn px-1.5 text-[11px] font-semibold text-white tabular-nums">{pendingApprovals}</span>
      ) : null}
    </Link>
  );
  return (
    <nav className="space-y-4">
      <div className="space-y-0.5">{ITEMS.map(link)}</div>
      <div className="space-y-0.5 border-t border-border pt-4">{SECONDARY.map(link)}</div>
    </nav>
  );
}

// Phones and small tablets: a menu button that opens the same navigation in a drawer.
export function MobileNav({ pendingApprovals, orgName, email }: { pendingApprovals: number; orgName: string; email: string }) {
  const path = usePathname();
  // Remember which page the menu was opened on, so navigating anywhere closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (v: boolean) => setOpenOn(v ? path : null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <>
      <button type="button" aria-label="Open menu" className="relative -ml-2 rounded-md p-2 text-foreground hover:bg-surface-muted md:hidden" onClick={() => setOpen(true)}>
        <Menu size={20} />
        {pendingApprovals > 0 ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-warn" /> : null}
      </button>
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-foreground/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface px-3 py-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between px-3">
              <span className="text-sm font-semibold tracking-tight">AutonomOS</span>
              <button type="button" aria-label="Close menu" className="-mr-2 rounded-md p-2 text-muted hover:bg-surface-muted" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Nav pendingApprovals={pendingApprovals} />
            </div>
            <ShellFooter orgName={orgName} email={email} />
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ShellFooter({ orgName, email }: { orgName: string; email: string }) {
  return (
    <div className="mt-4 border-t border-border px-3 pt-4 text-xs text-muted">
      <div className="truncate font-medium text-foreground">{orgName}</div>
      <div className="truncate">{email}</div>
      <form action="/auth/signout" method="post" className="mt-2">
        <button className="hover:text-foreground" type="submit">
          Sign out
        </button>
      </form>
    </div>
  );
}
