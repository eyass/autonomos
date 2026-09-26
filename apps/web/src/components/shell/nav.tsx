"use client";
import { Activity, Bot, Check, CheckCircle2, ChevronsUpDown, FlaskConical, Plus, LayoutDashboard, LifeBuoy, Lightbulb, LogOut, Pencil, Plug, Settings, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogoMark, Wordmark } from "@/components/brand/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const MAIN = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/approvals", label: "Approvals", icon: CheckCircle2 },
  { href: "/processes", label: "Processes", icon: Workflow },
  { href: "/opportunities", label: "Opportunities", icon: Lightbulb },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/activity", label: "Activity", icon: Activity },
];
const ADMIN = [
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/docs", label: "Help", icon: LifeBuoy },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`) || (href === "/processes" && path.startsWith("/discover"));
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
  createSample,
  signOut,
}: {
  pendingApprovals: number;
  orgName: string;
  orgId: string;
  email: string;
  name: string;
  workspaces: Workspace[];
  switchWorkspace: (id: string) => Promise<unknown>;
  createSample: () => Promise<unknown>;
  signOut: () => Promise<unknown>;
}) {
  const path = usePathname();
  const [pending, start] = useTransition();
  const { setOpenMobile } = useSidebar();
  const group = (items: typeof MAIN) => (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ href, label, icon: Icon }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton
                asChild
                isActive={isActive(path, href)}
                tooltip={label}
                className="relative data-[active=true]:font-semibold data-[active=true]:before:absolute data-[active=true]:before:inset-y-2 data-[active=true]:before:left-0 data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-full data-[active=true]:before:bg-highlight"
              >
                <Link href={href} onClick={() => setOpenMobile(false)}>
                  <Icon />
                  <span>{label}</span>
                </Link>
              </SidebarMenuButton>
              {href === "/approvals" && pendingApprovals > 0 ? (
                <SidebarMenuBadge className="rounded-full bg-highlight text-highlight-foreground peer-data-[active=true]/menu-button:text-highlight-foreground">{pendingApprovals}</SidebarMenuBadge>
              ) : null}
            </SidebarMenuItem>
          ))}
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
        {group(MAIN)}
        <div className="mt-auto">{group(ADMIN)}</div>
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
                  <DropdownMenuItem disabled={pending} onSelect={() => start(async () => void (await createSample()))}>
                    <FlaskConical />
                    {pending ? "Setting up…" : "Explore a sample workspace"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/onboarding/company?new=1" onClick={() => setOpenMobile(false)}>
                    <Plus />
                    New workspace
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings#company" onClick={() => setOpenMobile(false)}>
                    <Pencil />
                    Rename or delete workspace
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
