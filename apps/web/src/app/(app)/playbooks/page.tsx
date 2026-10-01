import { BookOpen, Check } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ButtonLink } from "@/components/app/button-link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/session";
import { isPlatformAdmin, playbookGallery, type GalleryPlaybook } from "@/server/playbooks";
import { INDUSTRIES, type Industry } from "@autonomos/schemas";
import { IndustryPicker } from "./industry-picker";

export const metadata = { title: "Playbooks" };

// Ready-made playbooks: templates for common work that run on whichever tools a company uses.
export default async function PlaybooksPage({ searchParams }: { searchParams: Promise<{ department?: string; industry?: string }> }) {
  const session = await requireSession();
  const { department, industry: industryParam } = await searchParams;
  const all = await playbookGallery(session);
  const yours = session.org.industry;
  // Opens on the workspace's own industry when there are playbooks made for it.
  const industry = industryParam === "all" ? null : industryParam && (INDUSTRIES as readonly string[]).includes(industryParam) ? industryParam : yours && all.some((p) => p.forYou) ? yours : null;
  // A playbook tagged with no industry suits every industry.
  const inIndustry = industry ? all.filter((p) => !p.industries.length || p.industries.includes(industry as Industry)) : all;
  const departments = [...new Set(inIndustry.map((p) => p.department))].sort();
  const shown = department ? inIndustry.filter((p) => p.department === department) : inIndustry;
  const href = (next: { industry?: string | null; department?: string | null }) => {
    const q = new URLSearchParams();
    const i = next.industry === undefined ? industry : next.industry;
    const d = next.department === undefined ? department : next.department;
    q.set("industry", i ?? "all");
    if (d) q.set("department", d);
    return `/playbooks?${q}`;
  };
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
      {all.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <IndustryPicker value={industry ?? "all"} yours={yours} />
          {industry && industry === yours ? <span className="text-muted-foreground">Made for your industry. Shared playbooks included.</span> : null}
          {industry ? (
            <Link href={href({ industry: null, department: null })} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Show all industries
            </Link>
          ) : null}
        </div>
      ) : null}
      {departments.length > 1 ? (
        <nav aria-label="Departments" className="mb-4 flex flex-wrap gap-2">
          {[undefined, ...departments].map((d) => (
            <Link
              key={d ?? "all"}
              href={href({ department: d ?? null })}
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
      ) : !shown.length ? (
        <EmptyState icon={BookOpen} tone="amber" title="No playbooks here yet" description="Try another department or show all industries." />
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
