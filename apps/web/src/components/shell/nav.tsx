"use client";
import { Activity, Bot, CheckCircle2, ChevronsUpDown, LayoutDashboard, LifeBuoy, Lightbulb, LogOut, Plug, Settings, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
export function AppSidebar({ pendingApprovals, orgName, email, name }: { pendingApprovals: number; orgName: string; email: string; name: string }) {
  const path = usePathname();
  const { setOpenMobile } = useSidebar();
  const group = (items: typeof MAIN) => (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ href, label, icon: Icon }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton asChild isActive={isActive(path, href)} tooltip={label}>
                <Link href={href} onClick={() => setOpenMobile(false)}>
                  <Icon />
                  <span>{label}</span>
                </Link>
              </SidebarMenuButton>
              {href === "/approvals" && pendingApprovals > 0 ? (
                <SidebarMenuBadge className="bg-warning text-white peer-data-[active=true]/menu-button:text-white">{pendingApprovals}</SidebarMenuBadge>
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
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">A</div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">AutonomOS</span>
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
                <DropdownMenuItem asChild>
                  <Link href="/settings" onClick={() => setOpenMobile(false)}>
                    <Settings />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <form action="/auth/signout" method="post">
                  <DropdownMenuItem asChild>
                    <button type="submit" className="w-full">
                      <LogOut />
                      Sign out
                    </button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
