import Link from "next/link";
import { redirect } from "next/navigation";
import { MobileNav, Nav, ShellFooter } from "@/components/shell/nav";
import { Notifications } from "@/components/shell/notifications";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { markNotificationsRead } from "./shell-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (!session.org.onboardingCompletedAt) redirect(session.org.onboardingStep === "connect" ? "/onboarding/connect" : "/onboarding/about");
  const supabase = await createClient();
  const [{ count: pending }, { data: notifications }] = await Promise.all([
    supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id).eq("status", "pending"),
    supabase.from("notifications").select("id, title, body, link, created_at, read_at").eq("organization_id", session.org.id).order("created_at", { ascending: false }).limit(15),
  ]);
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-surface px-3 py-4 md:flex">
        <Link href="/" className="mb-6 px-3 text-sm font-semibold tracking-tight">
          AutonomOS
        </Link>
        <div className="flex-1 overflow-y-auto">
          <Nav pendingApprovals={pending ?? 0} />
        </div>
        <ShellFooter orgName={session.org.name} email={session.user.email} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface px-4 sm:px-6 md:static">
          <MobileNav pendingApprovals={pending ?? 0} orgName={session.org.name} email={session.user.email} />
          <Link href="/" className="text-sm font-semibold tracking-tight md:hidden">
            AutonomOS
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Notifications items={notifications ?? []} markRead={markNotificationsRead} />
          </div>
        </header>
        {session.org.agentsPaused ? (
          <div className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-sm text-warn sm:px-6">
            All agents are paused. No agent will take new actions until an admin resumes them in <Link className="underline" href="/settings">Settings</Link>.
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
