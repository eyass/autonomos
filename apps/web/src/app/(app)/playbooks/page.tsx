import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ButtonLink } from "@/components/app/button-link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/session";
import { connectedIntegrationKeys } from "@/server/opportunities";
import { isPlatformAdmin, playbookGallery } from "@/server/playbooks";
import { SystemLogo } from "../integrations/add-systems";

export const metadata = { title: "Playbooks" };

// Ready-made playbooks: a process and the agent that runs it, to start from instead of a blank page.
export default async function PlaybooksPage({ searchParams }: { searchParams: Promise<{ department?: string }> }) {
  const session = await requireSession();
  const { department } = await searchParams;
  const all = await playbookGallery(await connectedIntegrationKeys(session));
  const departments = [...new Set(all.map((p) => p.department))].sort();
  const shown = department ? all.filter((p) => p.department === department) : all;
  const ready = shown.filter((p) => p.ready);
  const rest = shown.filter((p) => !p.ready);
  return (
    <>
      <PageHeader
        title="Playbooks"
        description="Ready-made agents for common work. Pick one, say how often the work comes up, and test the agent on your own systems."
        actions={
          isPlatformAdmin(session) ? (
            <ButtonLink href="/admin/playbooks" variant="outline">
              Playbook studio
            </ButtonLink>
          ) : null
        }
      />
      {departments.length > 1 ? (
        <nav aria-label="Departments" className="mb-4 flex flex-wrap gap-2">
          {[undefined, ...departments].map((d) => (
            <Link
              key={d ?? "all"}
              href={d ? `/playbooks?department=${encodeURIComponent(d)}` : "/playbooks"}
              aria-current={d === department ? "page" : undefined}
              className="rounded-full border px-3 py-1 text-sm text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
            >
              {d ?? "All"}
            </Link>
          ))}
        </nav>
      ) : null}
      {!all.length ? (
        <EmptyState title="No playbooks yet" description="Ready-made playbooks appear here as they are published." />
      ) : (
        <div className="space-y-6">
          {ready.length ? <Section title="Ready with your tools" items={ready} /> : null}
          {rest.length ? <Section title={ready.length ? "Connect a tool to use" : "Connect the tools to use"} items={rest} /> : null}
        </div>
      )}
    </>
  );
}

function Section({ title, items }: { title: string; items: Awaited<ReturnType<typeof playbookGallery>> }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="playbook-gallery">
        {items.map((p) => (
          <Link key={p.id} href={`/playbooks/${p.id}`} className="group">
            <Card className="h-full gap-3 px-4 py-4 sm:gap-3 sm:py-4 transition-colors group-hover:border-foreground/30">
              <div className="flex items-center gap-1.5">
                {p.tools.map((t) => (
                  <SystemLogo key={t.key} src={t.logo} name={t.name} className={`size-7 ${t.connected ? "" : "opacity-50 grayscale"}`} />
                ))}
                <Badge variant="secondary" className="ml-auto">
                  {p.department}
                </Badge>
              </div>
              <div>
                <div className="font-medium">{p.title}</div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>
              </div>
              <div className="mt-auto text-xs text-muted-foreground">
                {p.ready
                  ? `${p.steps} steps${p.minutes ? ` · about ${Math.round(p.minutes)} min each time today` : ""}`
                  : `Connect ${p.tools
                      .filter((t) => !t.connected)
                      .map((t) => t.name)
                      .join(" and ")}`}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
