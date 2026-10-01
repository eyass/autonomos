import { BookOpen, Check } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ButtonLink } from "@/components/app/button-link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/session";
import { isPlatformAdmin, playbookGallery, type GalleryPlaybook } from "@/server/playbooks";

export const metadata = { title: "Playbooks" };

// Ready-made playbooks: templates for common work that run on whichever tools a company uses.
export default async function PlaybooksPage({ searchParams }: { searchParams: Promise<{ department?: string }> }) {
  const session = await requireSession();
  const { department } = await searchParams;
  const all = await playbookGallery(session);
  const departments = [...new Set(all.map((p) => p.department))].sort();
  const shown = department ? all.filter((p) => p.department === department) : all;
  const ready = shown.filter((p) => p.ready);
  const rest = shown.filter((p) => !p.ready);
  return (
    <>
      <PageHeader
        title="Playbooks"
        description="Ready-made templates for common work. Pick one, connect your own tool to each step, and test the agent before it goes live."
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
        <EmptyState icon={BookOpen} tone="amber" title="No playbooks yet" description="Ready-made playbooks appear here as they are published." />
      ) : (
        <div className="space-y-6">
          {ready.length ? <Section title="Ready with your tools" items={ready} /> : null}
          {rest.length ? <Section title={ready.length ? "Connect a tool to use" : "Connect your tools to use"} items={rest} /> : null}
        </div>
      )}
    </>
  );
}

function Section({ title, items }: { title: string; items: GalleryPlaybook[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="playbook-gallery">
        {items.map((p) => (
          <Link key={p.id} href={`/playbooks/${p.id}`} className="group">
            <Card className="h-full gap-3 px-4 py-4 transition-colors group-hover:border-foreground/30 sm:gap-3 sm:py-4">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{p.title}</div>
                <Badge variant="secondary" className="shrink-0">
                  {p.department}
                </Badge>
              </div>
              <p className="line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>
              <ul className="mt-auto flex flex-wrap gap-1.5" aria-label="Needs">
                {p.capabilities.map((c) => (
                  <li
                    key={c.key}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${c.covered ? "border-success/30 bg-success-soft text-success" : "text-muted-foreground"}`}
                  >
                    {c.covered ? <Check className="size-3" /> : null}
                    {c.label}
                  </li>
                ))}
              </ul>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
