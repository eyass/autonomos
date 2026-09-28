import { OG_IMAGES } from "@/components/marketing/config";
import { ArrowRight, Bot, Check, FileSearch, ListChecks, Lock, OctagonX, ScrollText, ShieldCheck, Target, Wallet } from "lucide-react";
import { TOOLS, ToolLogo, type ToolSlug } from "@/components/marketing/tools";
import { WorkflowChains } from "@/components/marketing/workflows";
import { DepartmentCards } from "@/components/marketing/solutions";
import type { Metadata } from "next";
import Link from "next/link";
import { PLANS } from "@autonomos/schemas";
import { num } from "@/lib/format";
import { CONTACT_EMAIL } from "@/components/marketing/site";
import { HeroRun } from "@/components/marketing/hero-run";
import { AgentVisual, HoursByLevel, InventoryVisual, OpportunityVisual, PolicyFlow, SetupFlow, TOOL_COUNT } from "@/components/marketing/visuals";
import { LevelMeter } from "@/components/brand/logo";
import { ButtonLink } from "@/components/app/button-link";
import { Card } from "@/components/ui/card";

const title = "AutonomOS: find the recurring work, deploy constrained AI agents";
const description = "AutonomOS finds the recurring work in your company, deploys constrained AI agents for it, and measures how autonomous you are becoming.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, url: "/", type: "website", siteName: "AutonomOS", images: OG_IMAGES },
};

const STEPS = [
  { icon: FileSearch, visual: InventoryVisual, label: "Process", title: "Map the work", body: "Drafted from your systems. You approve it." },
  { icon: Target, visual: OpportunityVisual, label: "Opportunity", title: "Pick what to automate", body: "Ranked by value, difficulty and risk." },
  { icon: Bot, visual: AgentVisual, label: "Agent", title: "Deploy under control", body: "Tested on sandbox data, then live under approvals." },
];

const LEVELS = [
  { level: "L1", name: "Human only", body: "People do it." },
  { level: "L2", name: "Agent assists", body: "It drafts, you act." },
  { level: "L3", name: "Agent proposes", body: "You approve each action." },
  { level: "L4", name: "Agent executes", body: "You handle exceptions." },
  { level: "L5", name: "Autonomous", body: "It runs within its limits." },
];

const CONTROLS = [
  { icon: ListChecks, title: "Tool allowlists", body: "Only the tools you grant." },
  { icon: ShieldCheck, title: "Policy in code", body: "Checked before every write." },
  { icon: Wallet, title: "Money limits", body: "Approval above a threshold, hard caps always." },
  { icon: OctagonX, title: "Emergency stop", body: "One switch pauses every agent." },
  { icon: ScrollText, title: "Audit log", body: "Every action, append-only." },
  { icon: Lock, title: "Sandbox first", body: "Tests never touch live accounts." },
];

const WALL: ToolSlug[] = [
  "google",
  "outlook",
  "slack",
  "hubspot",
  "salesforce",
  "stripe",
  "zendesk",
  "intercom",
  "notion",
  "atlassian",
  "asana",
  "shopify",
  "intuit",
  "xero",
  "airtable",
  "mailchimp",
  "docusign",
  "linear",
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-ink text-ink-foreground">
        <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_70%_30%,black,transparent_75%)]" />
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 size-[36rem] rounded-full bg-highlight/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <Link href="/solutions" className="eyebrow inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-white/80 hover:text-white">
              <span aria-hidden className="signal-pulse size-1.5 rounded-full bg-highlight" />
              Agents for every team <ArrowRight size={12} />
            </Link>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.03em] sm:text-6xl sm:leading-[1.02]">
              Automate the recurring work. <span className="text-highlight">Safely.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base text-white/70 sm:text-lg">AI agents that work across your tools, inside limits you set.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/signup" size="lg" className="bg-highlight text-highlight-foreground hover:bg-highlight/90">
                Start free <ArrowRight size={16} />
              </ButtonLink>
              <ButtonLink href="#workflows" size="lg" variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white">
                See it work
              </ButtonLink>
            </div>
            <p className="mt-10 flex items-center gap-2 font-mono text-xs text-white/55">
              <LevelMeter level={5} tone="inverted" className="h-3" />
              {TOOL_COUNT} tools · L1 to L5 · every write checked in code
            </p>
          </div>
          <div className="flex justify-center pb-8 lg:justify-end">
            <HeroRun />
          </div>
        </div>
      </section>

      {/* Logo wall */}
      <section aria-label="Tools it connects to" className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <p className="eyebrow text-center text-muted-foreground">Works with the tools you already use</p>
          <ul className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-9">
            {WALL.map((t) => (
              <li key={t} className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-3" title={TOOLS[t]}>
                <ToolLogo tool={t} size={32} />
                <span className="w-full truncate text-center text-[11px] text-muted-foreground">{TOOLS[t]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <a href="#setup" className="font-medium text-foreground underline-offset-4 hover:underline">
              + {TOOL_COUNT} more
            </a>
          </p>
        </div>
      </section>

      {/* Workflows */}
      <section id="workflows" className="scroll-mt-16 border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading eyebrow="Example" title="One agent, many tools">
            Each agent chains the steps a person would take. Hand marks a step a person approves.
          </SectionHeading>
          <div className="mt-10">
            <WorkflowChains />
          </div>
        </div>
      </section>

      {/* By team */}
      <section id="teams" className="scroll-mt-16 border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading eyebrow="By team" title="Agents for every team" />
          <div className="mt-10">
            <DepartmentCards />
          </div>
        </div>
      </section>

      {/* Setup */}
      <section id="setup" className="scroll-mt-16 border-b border-border bg-brand-soft/50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <SectionHeading eyebrow="Setup" title="Live in minutes">
              No engineers. No integration project.
            </SectionHeading>
            <ButtonLink href="/signup" size="lg" className="shrink-0 self-start md:self-auto">
              Start free <ArrowRight size={16} />
            </ButtonLink>
          </div>
          <div className="mt-10">
            <SetupFlow />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-16 border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading eyebrow="How it works" title="From process to agent" />
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.label}>
                <Card className="h-full gap-0 p-5 sm:gap-0">
                  <div className="-mx-1 -mt-1 mb-5 rounded-xl bg-grid-light bg-muted/60 p-3">
                    <s.visual />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-md bg-brand text-white">
                      <s.icon size={18} />
                    </span>
                    <span className="eyebrow text-muted-foreground">
                      {String(i + 1).padStart(2, "0")} · {s.label}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Control plane */}
      <section id="control" className="scroll-mt-16 border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading eyebrow="Control" title="Raise autonomy one level at a time" />
          <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            {LEVELS.map((l, i) => (
              <li key={l.level} className="flex flex-col rounded-lg border border-border bg-background p-4 lg:min-h-[var(--h)]" style={{ "--h": `${7.5 + i * 2}rem` } as React.CSSProperties}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold" style={{ color: `var(--level-${Math.max(i + 1, 3)})` }}>
                    {l.level}
                  </span>
                  <LevelMeter level={i + 1} tone={i === 4 ? "signal" : "levels"} />
                </div>
                <span className="mt-3 text-sm font-semibold">{l.name}</span>
                <p className="mt-1 text-sm text-muted-foreground">{l.body}</p>
                <span aria-hidden className="mt-auto block pt-4">
                  <span className="block h-1 rounded-full" style={{ background: i === 4 ? "var(--highlight)" : `var(--level-${i + 1})` }} />
                </span>
              </li>
            ))}
          </ol>
          <h3 className="mt-14 text-lg font-semibold tracking-tight sm:text-xl">The model proposes. Code decides.</h3>
          <div className="mt-6">
            <PolicyFlow />
          </div>
          <div className="mt-12 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {CONTROLS.map((c) => (
              <div key={c.title} className="flex gap-3">
                <c.icon size={18} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">{c.title}</h3>
                  <p className="text-sm text-muted-foreground">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-10 text-sm">
            <ButtonLink href="/security" variant="link">
              How security works <ArrowRight size={14} />
            </ButtonLink>
          </p>
        </div>
      </section>

      {/* The math */}
      <section id="example" className="scroll-mt-16 border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading eyebrow="The math" title="320 refunds a month, 43 hours of work">
            An illustrative example: what each level takes off your team.
          </SectionHeading>
          <div className="mt-10">
            <HoursByLevel />
          </div>
        </div>
      </section>

      {/* Pricing: the same plans and limits the app bills on (PLANS). */}
      <section id="pricing" className="scroll-mt-16 border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading eyebrow="Pricing" title="Priced by work done, not seats">
            Start free, no card needed.
          </SectionHeading>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {(["starter", "growth"] as const).map((key) => {
              const p = PLANS[key];
              return (
                <Card key={key} className={`gap-0 p-6 sm:gap-0 ${key === "growth" ? "border-primary ring-1 ring-primary/30" : ""}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">{p.name}</h3>
                    {key === "growth" ? <span className="rounded bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand-strong">Most teams</span> : null}
                  </div>
                  <p className="mt-3 font-display text-3xl font-semibold tracking-tight">
                    €{num(p.price)}
                    <span className="text-sm font-normal text-muted-foreground"> / month</span>
                  </p>
                  <ul className="mt-4 space-y-2 text-sm">
                    {[`${p.activeAgents} live agents`, `${num(p.runsPerMonth)} runs a month`, `Then €${p.overagePerRun} per run`, "Free test runs, no seat fees"].map((t) => (
                      <li key={t} className="flex gap-2">
                        <Check size={16} className="mt-0.5 shrink-0 text-primary" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                  <ButtonLink href="/signup" className="mt-6" variant={key === "growth" ? "default" : "outline"}>
                    Start free
                  </ButtonLink>
                </Card>
              );
            })}
            <Card className="gap-0 p-6 sm:gap-0">
              <h3 className="text-base font-semibold">Larger teams</h3>
              <p className="mt-3 font-display text-3xl font-semibold tracking-tight">Custom</p>
              <ul className="mt-4 space-y-2 text-sm">
                {["Limits sized to your volume", "A data processing agreement", "A named contact"].map((t) => (
                  <li key={t} className="flex gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-primary" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <a href={`mailto:${CONTACT_EMAIL}?subject=Pricing`} className="mt-6 inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">
                Talk to us
              </a>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-grid-light">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 sm:py-20 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3">
            <LevelMeter level={5} tone="signal" className="mt-1.5 h-5" />
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">How autonomous is your company?</h2>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <ButtonLink href="/signup" size="lg">
              Start free
            </ButtonLink>
            <ButtonLink href="/docs" size="lg" variant="outline">
              Read the docs
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow flex items-center gap-2 text-highlight-strong">
        <span aria-hidden className="h-3 w-1 rounded-full bg-highlight" />
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {children ? <p className="mt-3 text-sm text-muted-foreground sm:text-base">{children}</p> : null}
    </div>
  );
}
