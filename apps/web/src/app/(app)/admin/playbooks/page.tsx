import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/session";
import { relative } from "@/lib/format";
import { draftJobs, isPlatformAdmin, listPlaybooks, studioToolkits, toolkitInfo } from "@/server/playbooks";
import { SystemLogo } from "../../integrations/add-systems";
import { DraftForm, DraftMissing, DraftQueue } from "./studio";

export const metadata = { title: "Playbook studio" };
// Drafting runs after the response, in this function.
export const maxDuration = 300;

// Where the site's administrators create the ready-made playbooks every workspace can start
// from: AI drafts one from a tool's real actions, an administrator reviews and publishes it.
export default async function PlaybookStudioPage() {
  const session = await requireSession();
  if (!isPlatformAdmin(session)) notFound();
  const [playbooks, toolkits, jobs] = await Promise.all([listPlaybooks(), studioToolkits(), draftJobs(session.user.id)]);
  const info = await toolkitInfo(playbooks.flatMap((p) => p.toolkits));
  const missing = toolkits.filter((t) => !t.playbooks).length;
  const published = playbooks.filter((p) => p.status === "published").length;
  return (
    <>
      <PageHeader
        title="Playbook studio"
        description="Ready-made playbooks are templates every workspace can start from. Draft one for a tool with AI, review it, then publish it."
        actions={<DraftMissing count={missing} />}
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
          <DraftQueue jobs={jobs.map((j) => ({ ...j, name: toolkits.find((t) => t.key === j.toolkit)?.name ?? j.toolkit }))} />
          {playbooks.length ? (
            <Card className="gap-0 py-0 sm:gap-0 sm:py-0" data-testid="playbook-library">
              {playbooks.map((p) => (
                <Link key={p.id} href={`/admin/playbooks/${p.id}`} className="flex items-center gap-3 border-b px-4 py-3 last:border-0 hover:bg-muted/50">
                  <div className="flex shrink-0 -space-x-1.5">
                    {p.toolkits.slice(0, 3).map((k) => (
                      <SystemLogo key={k} src={info.get(k)?.logo ?? null} name={info.get(k)?.name ?? k} className="size-7 ring-2 ring-card" />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.department} · {p.toolkits.map((k) => info.get(k)?.name ?? k).join(", ")} · {p.agent.tools.length} actions · updated {relative(p.updated_at)}
                    </div>
                  </div>
                  <Badge variant={p.status === "published" ? "success" : "secondary"}>{p.status === "published" ? "Published" : "Draft"}</Badge>
                </Link>
              ))}
            </Card>
          ) : (
            <EmptyState title="No playbooks yet" description="Draft the first one for a tool, or draft one for every popular tool at once." />
          )}
        </section>
        <aside className="space-y-3">
          <h2 className="text-sm font-semibold">Draft a playbook</h2>
          <DraftForm toolkits={toolkits} />
        </aside>
      </div>
    </>
  );
}
