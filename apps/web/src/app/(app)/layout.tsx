import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/shell/nav";
import { Notifications } from "@/components/shell/notifications";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { markNotificationsRead } from "./shell-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (!session.org.onboardingCompletedAt) redirect(session.org.onboardingStep === "connect" ? "/onboarding/connect" : "/onboarding/about");
  const supabase = await createClient();
  const [{ count: pending }, { data: notifications }] = await Promise.all([
    supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id).eq("status", "pending"),
    supabase.from("notifications").select("id, title, body, link, created_at, read_at").eq("organization_id", session.org.id).order("created_at", { ascending: false }).limit(15),
  ]);
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar pendingApprovals={pending ?? 0} orgName={session.org.name} email={session.user.email} name={`${session.user.firstName} ${session.user.lastName}`.trim()} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 sm:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <Link href="/" className="text-sm font-semibold tracking-tight md:hidden">
            AutonomOS
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Notifications items={notifications ?? []} markRead={markNotificationsRead} />
          </div>
        </header>
        {session.org.agentsPaused ? (
          <div className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm text-warning sm:px-6">
            All agents are paused. No agent will take new actions until an admin resumes them in{" "}
            <Link className="underline" href="/settings">
              Settings
            </Link>
            .
          </div>
        ) : null}
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
