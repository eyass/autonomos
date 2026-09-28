import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/session";
import { relative } from "@/lib/format";
import { capabilityInfo } from "@autonomos/integrations";
import { DEPARTMENTS } from "@autonomos/schemas";
import { draftJobs, isPlatformAdmin, listPlaybooks, STARTER_PLAYBOOKS } from "@/server/playbooks";
import { DraftForm, DraftQueue, DraftStarter } from "./studio";

export const metadata = { title: "Playbook studio" };
// Drafting runs after the response, in this function.
export const maxDuration = 300;

// Where the site's administrators create the ready-made playbooks every workspace can start
// from. A playbook names what each step needs (a help desk, a payment system), never a
// product; each workspace connects its own tools to it.
export default async function PlaybookStudioPage() {
  const session = await requireSession();
  if (!isPlatformAdmin(session)) notFound();
  const [playbooks, jobs] = await Promise.all([listPlaybooks(), draftJobs(session.user.id)]);
  const published = playbooks.filter((p) => p.status === "published").length;
  return (
    <>
      <PageHeader
        title="Playbook studio"
        description="Playbooks are templates every workspace can start from. Each step says what kind of system it needs, and customers connect their own tools to it. Draft one with AI, review it, then publish it."
        actions={playbooks.length ? null : <DraftStarter count={STARTER_PLAYBOOKS.length} />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 space-y-3" aria-labelledby="library">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="library" className="text-sm font-semibold">
              Library
            </h2>
            <span className="text-xs text-muted-foreground">
              {published} published · {playbooks.length - published} drafts
            </span>
          </div>
          <DraftQueue jobs={jobs} />
          {playbooks.length ? (
            <Card className="gap-0 py-0 sm:gap-0 sm:py-0" data-testid="playbook-library">
              {playbooks.map((p) => (
                <Link key={p.id} href={`/admin/playbooks/${p.id}`} className="flex items-center gap-3 border-b px-4 py-3 last:border-0 hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.department} · {p.capabilities.map((c) => capabilityInfo(c)?.label ?? c).join(", ")} · {p.steps.length} steps · updated {relative(p.updated_at)}
                    </div>
                  </div>
                  <Badge variant={p.status === "published" ? "success" : "secondary"}>{p.status === "published" ? "Published" : "Draft"}</Badge>
                </Link>
              ))}
            </Card>
          ) : (
            <EmptyState title="No playbooks yet" description="Draft the first one, or draft a starter library of common work across departments." />
          )}
        </section>
        <aside className="space-y-3">
          <h2 className="text-sm font-semibold">Draft a playbook</h2>
          <DraftForm departments={DEPARTMENTS.filter((d) => d !== "Other")} />
        </aside>
      </div>
    </>
  );
}
