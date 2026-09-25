import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/shell/nav";
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
        <Nav pendingApprovals={pending ?? 0} />
        <div className="mt-auto px-3 text-xs text-muted">
          <div className="truncate font-medium text-foreground">{session.org.name}</div>
          <div className="truncate">{session.user.email}</div>
          <form action="/auth/signout" method="post" className="mt-2">
            <button className="hover:text-foreground" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
          <div className="text-sm text-muted md:hidden">AutonomOS</div>
          <div className="ml-auto flex items-center gap-2">
            <Notifications items={notifications ?? []} markRead={markNotificationsRead} />
          </div>
        </header>
        {session.org.agentsPaused ? (
          <div className="border-b border-warn/30 bg-warn-soft px-6 py-2 text-sm text-warn">
            All agents are paused. No agent will take new actions until an admin resumes them in <Link className="underline" href="/settings">Settings</Link>.
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
