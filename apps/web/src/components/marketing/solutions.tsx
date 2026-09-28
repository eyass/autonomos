import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/app/button-link";
import { DEPARTMENTS, type Department } from "./departments";
import { TOOLS, ToolLogo } from "./tools";
import { WorkflowChains } from "./workflows";

// A card per team, linking to its page: used on the landing page and the solutions index.
export function DepartmentCards({ exclude }: { exclude?: string }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {DEPARTMENTS.filter((d) => d.slug !== exclude).map((d) => (
        <li key={d.slug}>
          <Link href={`/solutions/${d.slug}`} className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-brand-soft/40">
            <span className="flex items-center justify-between gap-2">
              <span className="text-base font-semibold">{d.name}</span>
              <ArrowRight size={16} className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </span>
            <span className="mt-1 text-sm text-muted-foreground">{d.headline}</span>
            <span className="mt-4 flex flex-wrap gap-1.5" aria-hidden>
              {d.tools.slice(0, 6).map((t) => (
                <ToolLogo key={t} tool={t} size={26} label={false} className="border border-border" />
              ))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DepartmentPage({ d }: { d: Department }) {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border bg-ink text-ink-foreground">
        <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_70%_30%,black,transparent_75%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <Link href="/solutions" className="eyebrow text-white/60 hover:text-white">
            Solutions / {d.name}
          </Link>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.03em] sm:text-5xl sm:leading-[1.05]">
            {d.name} <span className="text-highlight">on autopilot.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/70 sm:text-lg">{d.headline}</p>
          <ul className="mt-8 flex flex-wrap gap-2" aria-label={`Tools ${d.name} agents work in`}>
            {d.tools.map((t) => (
              <li key={t} className="flex items-center gap-2 rounded-full bg-white/10 py-1 pr-3 pl-1 text-sm">
                <ToolLogo tool={t} size={22} label={false} className="rounded-full" />
                {TOOLS[t]}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <ButtonLink href="/signup" size="lg" className="bg-highlight text-highlight-foreground hover:bg-highlight/90">
              Start free <ArrowRight size={16} />
            </ButtonLink>
          </div>
        </div>
      </section>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What {d.name.toLowerCase()} agents do</h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">{d.sub} The hand marks a step a person approves.</p>
          <div className="mt-8">
            <WorkflowChains flows={d.flows} />
          </div>
        </div>
      </section>
      <section className="bg-grid-light">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <h2 className="text-xl font-semibold tracking-tight">Other teams</h2>
          <div className="mt-6">
            <DepartmentCards exclude={d.slug} />
          </div>
        </div>
      </section>
    </>
  );
}
