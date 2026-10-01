"use client";
import { Activity, BookOpen, Bot, Building2, Check, ChevronsUpDown, FlaskConical, Inbox, LayoutDashboard, LifeBuoy, LogOut, Plug, Settings, Sparkles, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { requestJob } from "@/components/app/job";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogoMark, Wordmark } from "@/components/brand/logo";
import { AREA, TONE, type Tone } from "@/components/app/area";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

// The loop: see where you stand, answer what waits for you, map the work and what to automate
// (or start from a ready-made playbook), run agents, look back. Each item says what it holds.
type NavItem = { href: string; label: string; hint?: string; icon: typeof LayoutDashboard; also?: string[]; tone?: Tone };
// Each main area wears its colour (components/app/area.ts) on its icon tile.
const MAIN: NavItem[] = [
  { href: "/", label: "Home", hint: "How autonomous you are", icon: LayoutDashboard, tone: AREA.home },
  { href: "/approvals", label: "Inbox", hint: "Waiting for a person", icon: Inbox, tone: AREA.inbox },
  { href: "/processes", label: "Work", hint: "Processes and automation ideas", icon: Workflow, also: ["/opportunities", "/discover"], tone: AREA.work },
  { href: "/playbooks", label: "Playbooks", hint: "Templates to start from", icon: BookOpen, tone: AREA.playbooks },
  { href: "/agents", label: "Agents", hint: "Doing the work for you", icon: Bot, tone: AREA.agents },
  { href: "/activity", label: "History", hint: "Everything that happened", icon: Activity, tone: AREA.history },
];
const ADMIN: NavItem[] = [
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/docs", label: "Help", icon: LifeBuoy },
];

function isActive(path: string, item: NavItem) {
  if (item.href === "/") return path === "/";
  return [item.href, ...(item.also ?? [])].some((h) => path === h || path.startsWith(`${h}/`));
}

type Usage = { planName: string; runs: number; runsPerMonth: number; activeAgents: number; agentLimit: number };

// Plan usage at a glance, as the billing page counts it. Hidden when the sidebar is icons only.
function PlanUsage({ planName, runs, runsPerMonth, activeAgents, agentLimit, onNavigate }: Usage & { onNavigate: () => void }) {
  const rows = [
    { label: "Runs this month", used: runs, limit: runsPerMonth },
    { label: "Live agents", used: activeAgents, limit: agentLimit },
  ];
  return (
    <Link
      href="/settings#billing"
      onClick={onNavigate}
      aria-label={`${planName} plan usage: ${runs.toLocaleString("en")} of ${runsPerMonth.toLocaleString("en")} runs this month. Open billing.`}
      className="mx-2 mb-1 block rounded-xl border border-sidebar-border bg-card p-3 text-xs shadow-[0_1px_2px_rgb(18_24_22/0.04)] transition-colors hover:border-primary/30 group-data-[collapsible=icon]:hidden"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="eyebrow text-[11px] text-muted-foreground">{planName} plan</span>
        <span className="text-[11px] font-medium text-primary">Billing</span>
      </span>
      {rows.map((r) => {
        const pct = r.limit ? Math.min(100, Math.round((r.used / r.limit) * 100)) : 0;
        return (
          <span key={r.label} className="mt-2.5 block">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sidebar-foreground">{r.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {r.used.toLocaleString("en")} / {r.limit.toLocaleString("en")}
              </span>
            </span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
              <span className={`block h-full rounded-full ${pct >= 90 ? "bg-highlight" : "bg-brand"}`} style={{ width: `${Math.max(pct, r.used ? 4 : 0)}%` }} />
            </span>
          </span>
        );
      })}
    </Link>
  );
}

// The application sidebar, following the shadcn sidebar-07 block: collapses to icons on
// desktop and becomes a Sheet on phones.
type Workspace = { id: string; name: string; is_demo: boolean };

export function AppSidebar({
  pendingApprovals,
  orgName,
  orgId,
  email,
  name,
  workspaces,
  switchWorkspace,
  signOut,
  platformAdmin = false,
  usage,
}: {
  pendingApprovals: number;
  orgName: string;
  orgId: string;
  email: string;
  name: string;
  workspaces: Workspace[];
  switchWorkspace: (id: string) => Promise<unknown>;
  signOut: () => Promise<unknown>;
  // Site administrators also see the studio where ready-made playbooks are made.
  platformAdmin?: boolean;
  // This month's production runs and live agents against the plan, shown above settings.
  usage?: Usage;
}) {
  const path = usePathname();
  const [pending, start] = useTransition();
  const { setOpenMobile } = useSidebar();
  const router = useRouter();
  const group = (items: NavItem[], title?: string) => (
    <SidebarGroup>
      {title ? <SidebarGroupLabel className="eyebrow text-[11px] text-muted-foreground/80">{title}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const { href, label, hint, icon: Icon, tone } = item;
            return (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(path, item)}
                  tooltip={hint ? `${label}: ${hint}` : label}
                  className="relative h-9 text-[13.5px] text-sidebar-foreground/85 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground data-[active=true]:before:absolute data-[active=true]:before:inset-y-2 data-[active=true]:before:left-0 data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-full data-[active=true]:before:bg-highlight [&>svg]:size-[17px]"
                >
                  <Link href={href} title={hint} onClick={() => setOpenMobile(false)}>
                    {tone ? (
                      <span aria-hidden className={cn("-ml-1 flex size-6 shrink-0 items-center justify-center rounded-md border group-data-[collapsible=icon]:ml-0", TONE[tone].tile)}>
                        <Icon className="size-3.5" />
                      </span>
                    ) : (
                      <Icon />
                    )}
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
                {href === "/approvals" && pendingApprovals > 0 ? (
                  <SidebarMenuBadge className="rounded-full bg-highlight text-highlight-foreground peer-data-[active=true]/menu-button:text-highlight-foreground">{pendingApprovals}</SidebarMenuBadge>
                ) : null}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
  const initials = (name || email)
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/" onClick={() => setOpenMobile(false)}>
                <span className="flex size-8 shrink-0 items-center justify-center">
                  <LogoMark className="!size-8" />
                </span>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <Wordmark className="truncate text-sm" />
                  <span className="truncate text-xs text-muted-foreground">{orgName}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {group(MAIN, "Workspace")}
        <div className="mt-auto">
          {usage ? <PlanUsage {...usage} onNavigate={() => setOpenMobile(false)} /> : null}
          {group(platformAdmin ? [{ href: "/admin/playbooks", label: "Playbook studio", icon: Sparkles }, ...ADMIN] : ADMIN)}
        </div>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{name || email}</span>
                    <span className="truncate text-xs text-muted-foreground">{email}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" side="top" align="end" sideOffset={4}>
                <DropdownMenuLabel className="font-normal">
                  <div className="truncate text-sm font-medium">{orgName}</div>
                  <div className="truncate text-xs text-muted-foreground">{email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Workspaces</DropdownMenuLabel>
                {workspaces.map((w) => (
                  <DropdownMenuItem key={w.id} disabled={pending} onSelect={() => w.id !== orgId && start(async () => void (await switchWorkspace(w.id)))}>
                    {w.id === orgId ? <Check /> : <span className="size-4" />}
                    <span className="truncate">{w.name}</span>
                  </DropdownMenuItem>
                ))}
                {workspaces.some((w) => w.is_demo) ? null : (
                  <DropdownMenuItem
                    disabled={pending}
                    onSelect={() =>
                      start(async () => {
                        // Set up on the server; the Workspaces page follows it to the end.
                        const r = await requestJob("sample_workspace");
                        if (!r.ok) return void toast.error(r.error);
                        setOpenMobile(false);
                        router.push("/workspaces");
                      })
                    }
                  >
                    <FlaskConical />
                    {pending ? "Setting up…" : "Explore a sample workspace"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/workspaces" onClick={() => setOpenMobile(false)}>
                    <Building2 />
                    Manage workspaces
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings" onClick={() => setOpenMobile(false)}>
                    <Settings />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => start(async () => void (await signOut()))}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
