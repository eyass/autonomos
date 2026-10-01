import { OG_IMAGES } from "@/components/marketing/config";
import { ArrowRight, Check, ListChecks, Lock, OctagonX, ScrollText, ShieldCheck, Wallet } from "lucide-react";
import { TOOLS, ToolLogo, type ToolSlug } from "@/components/marketing/tools";
import { WorkflowChains } from "@/components/marketing/workflows";
import { DepartmentCards } from "@/components/marketing/solutions";
import type { Metadata } from "next";
import Link from "next/link";
import { PLANS } from "@autonomos/schemas";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CONTACT_EMAIL } from "@/components/marketing/site";
import { HeroRun } from "@/components/marketing/hero-run";
import { AgentVisual, HoursByLevel, InventoryVisual, OpportunityVisual, PolicyFlow, SetupFlow, TOOL_COUNT } from "@/components/marketing/visuals";
import { LevelMeter } from "@/components/brand/logo";
import { ButtonLink } from "@/components/app/button-link";

const title = "AutonomOS: find the recurring work, deploy constrained AI agents";
const description = "AutonomOS finds the recurring work in your company, deploys constrained AI agents for it, and measures how autonomous you are becoming.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, url: "/", type: "website", siteName: "AutonomOS", images: OG_IMAGES },
};

const STEPS = [
  {
    visual: InventoryVisual,
    label: "Process",
    title: "Map the work",
    body: "AutonomOS reads a month of your inbox, help desk and payments, and drafts the recurring work it finds. You approve what is real.",
    points: ["Evidence for every process", "Hours a month, per team", "Nothing saved without your say"],
  },
  {
    visual: OpportunityVisual,
    label: "Opportunity",
    title: "Pick what to automate",
    body: "Every process is scored on value, difficulty and risk, so the first agent is the one worth building.",
    points: ["Ranked, with the reason", "Before and after flow", "Approvals it would need"],
  },
  {
    visual: AgentVisual,
    label: "Agent",
    title: "Deploy under control",
    body: "The agent is tested on sandbox data first, then goes live at the level you choose, with approvals where money or customers are involved.",
    points: ["Test runs simulate every write", "Autonomy L1 to L5", "Pause everything in one click"],
  },
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
  const free = PLANS.design_partner;
  const plans = [
    {
      key: "free",
      name: free.name,
      price: "€0",
      blurb: "Try it on one process.",
      lead: "Includes",
      items: [`${free.activeAgents} live agent`, `${num(free.runsPerMonth)} runs a month`, "Unlimited test runs"],
      cta: "Start free",
    },
    {
      key: "starter",
      name: PLANS.starter.name,
      price: `€${num(PLANS.starter.price)}`,
      blurb: "Your first agents in production.",
      lead: "Everything in Free, plus",
      items: [`${PLANS.starter.activeAgents} live agents`, `${num(PLANS.starter.runsPerMonth)} runs a month`, `Then €${PLANS.starter.overagePerRun} per run`, "Unlimited test runs"],
      cta: "Start free",
    },
    {
      key: "growth",
      name: PLANS.growth.name,
      price: `€${num(PLANS.growth.price)}`,
      blurb: "Agents across every team.",
      lead: "Everything in Starter, plus",
      items: [`${PLANS.growth.activeAgents} live agents`, `${num(PLANS.growth.runsPerMonth)} runs a month`, `Then €${PLANS.growth.overagePerRun} per run`, "No seat fees, ever"],
      cta: "Start free",
      featured: true,
    },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-ink-foreground">
        <div aria-hidden className="bg-ink-glow pointer-events-none absolute inset-0" />
        <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_0%,black,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-4 pt-16 text-center sm:px-6 sm:pt-24">
          <Link
            href="/solutions"
            className="eyebrow inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-white/80 transition-colors hover:border-white/30 hover:text-white"
          >
            <span aria-hidden className="signal-pulse size-1.5 rounded-full bg-highlight" />
            Agents for every team <ArrowRight size={12} />
          </Link>
          <h1 className="mx-auto mt-7 max-w-4xl text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.035em] sm:text-6xl lg:text-[4.75rem]">
            Automate the recurring work. <span className="text-highlight">Safely.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-white/70 sm:text-lg">
            AutonomOS finds the work your team repeats every week, and runs it with AI agents that stay inside the limits you set.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/signup" size="lg" className="h-11 bg-highlight px-6 text-highlight-foreground hover:bg-highlight/90">
              Start free <ArrowRight size={16} />
            </ButtonLink>
            <ButtonLink href="#workflows" size="lg" variant="outline" className="h-11 border-white/25 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white">
              See it work
            </ButtonLink>
          </div>
          <p className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-white/50">
            <span>Free plan</span>
            <span aria-hidden>·</span>
            <span>No card</span>
            <span aria-hidden>·</span>
            <span>Sandbox first</span>
            <span aria-hidden>·</span>
            <span>Every write checked in code</span>
          </p>
          <div className="mt-14 sm:mt-16">
            <HeroRun />
          </div>
        </div>

        {/* Logo strip */}
        <div className="relative mt-14 border-t border-white/10 py-8">
          <p className="eyebrow text-center text-white/45">
            Works with the tools you already use ·{" "}
            <a href="#setup" className="text-white/70 underline-offset-4 hover:text-white hover:underline">
              {TOOL_COUNT} more
            </a>
          </p>
          <div className="mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
            <ul className="marquee flex w-max gap-3" aria-label="Tools it connects to">
              {[...WALL, ...WALL].map((t, i) => (
                <li
                  key={`${t}-${i}`}
                  aria-hidden={i >= WALL.length ? true : undefined}
                  className="flex shrink-0 items-center gap-2.5 rounded-full border border-white/10 bg-white/5 py-1.5 pr-4 pl-1.5 text-sm text-white/75"
                >
                  <ToolLogo tool={t} size={24} label={false} className="rounded-full" />
                  {TOOLS[t]}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-16 border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <SectionHeading eyebrow="How it works" title="From the work you do to an agent that does it" center>
            Three steps, each one reviewed by you before the next.
          </SectionHeading>
          <ol className="mt-16 space-y-16 sm:space-y-24">
            {STEPS.map((s, i) => (
              <li key={s.label} className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
                <div className={cn("relative rounded-3xl bg-grid-light bg-brand-soft/50 p-6 sm:p-10", i % 2 === 1 && "md:order-2")}>
                  <div className="mx-auto max-w-sm [&>div]:shadow-lg [&>div]:shadow-brand/10">
                    <s.visual />
                  </div>
                </div>
                <div>
                  <p className="flex items-center gap-3">
                    <span className="font-display text-5xl font-semibold leading-none tracking-tight text-brand/20 sm:text-6xl">{String(i + 1).padStart(2, "0")}</span>
                    <span className="eyebrow text-highlight-strong">{s.label}</span>
                  </p>
                  <h3 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{s.title}</h3>
                  <p className="mt-3 max-w-md text-base text-muted-foreground">{s.body}</p>
                  <ul className="mt-6 space-y-2.5 text-sm">
                    {s.points.map((p) => (
                      <li key={p} className="flex items-center gap-2.5">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                          <Check size={12} />
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Workflows */}
      <section id="workflows" className="scroll-mt-16 border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <SectionHeading eyebrow="Example" title="One agent, many tools">
            Each agent chains the steps a person would take. The hand marks a step a person approves.
          </SectionHeading>
          <div className="mt-12">
            <WorkflowChains phoneLimit={2} />
            <Link href="/solutions" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline sm:hidden">
              More workflows by team <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* Control plane */}
      <section id="control" className="relative scroll-mt-16 overflow-hidden bg-ink text-ink-foreground">
        <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_20%_0%,black,transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <SectionHeading eyebrow="Control" title="The model proposes. Code decides." tone="inverted">
            Agents never act on their own judgement alone. Every write passes the same checks, in code, before it touches a live system.
          </SectionHeading>
          <div className="mt-12">
            <PolicyFlow />
          </div>

          <h3 className="mt-20 text-xl font-semibold tracking-tight sm:text-2xl">Raise autonomy one level at a time</h3>
          <p className="mt-2 max-w-xl text-sm text-white/60 sm:text-base">Every agent starts where you are comfortable, and AutonomOS recommends when it has earned the next level.</p>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            {LEVELS.map((l, i) => (
              <li
                key={l.level}
                className={cn(
                  "flex flex-col rounded-xl border p-4 lg:min-h-[var(--h)]",
                  i === 4 ? "border-highlight/50 bg-highlight/10" : "border-white/10 bg-white/[0.04]",
                )}
                style={{ "--h": `${7.5 + i * 2}rem` } as React.CSSProperties}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("font-mono text-xs font-bold", i === 4 ? "text-highlight" : "text-white/70")}>{l.level}</span>
                  <LevelMeter level={i + 1} tone="inverted" />
                </div>
                <span className="mt-3 text-sm font-semibold">{l.name}</span>
                <p className="mt-1 text-sm text-white/60">{l.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-20 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {CONTROLS.map((c) => (
              <div key={c.title} className="flex gap-4 bg-ink p-6">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                  <c.icon size={18} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{c.title}</h3>
                  <p className="mt-0.5 text-sm text-white/60">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-8">
            <Link href="/security" className="inline-flex items-center gap-1.5 text-sm font-medium text-white underline-offset-4 hover:underline">
              How security works <ArrowRight size={14} />
            </Link>
          </p>
        </div>
      </section>

      {/* The math */}
      <section id="example" className="scroll-mt-16 border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <SectionHeading eyebrow="The math" title="320 refunds a month, 43 hours of work">
            An illustrative example: what each autonomy level takes off your team, from the same coefficients the autonomy score uses.
          </SectionHeading>
          <HoursByLevel />
        </div>
      </section>

      {/* By team */}
      <section id="teams" className="scroll-mt-16 border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <SectionHeading eyebrow="By team" title="Agents for every team" />
            <ButtonLink href="/solutions" variant="outline" className="shrink-0 self-start md:self-auto">
              All solutions <ArrowRight size={14} />
            </ButtonLink>
          </div>
          <div className="mt-12">
            <DepartmentCards />
          </div>
        </div>
      </section>

      {/* Setup */}
      <section id="setup" className="scroll-mt-16 border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <SectionHeading eyebrow="Setup" title="Live in minutes">
              No engineers, no integration project. Add your website, connect your tools and build your first agent.
            </SectionHeading>
            <ButtonLink href="/signup" size="lg" className="shrink-0 self-start md:self-auto">
              Start free <ArrowRight size={16} />
            </ButtonLink>
          </div>
          <div className="mt-12">
            <SetupFlow />
          </div>
        </div>
      </section>

      {/* Pricing: the same plans and limits the app bills on (PLANS). */}
      <section id="pricing" className="scroll-mt-16 border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <SectionHeading eyebrow="Pricing" title="Priced by work done, not seats" center>
            Start free, no card needed. Test runs are always free.
          </SectionHeading>
          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <div
                key={p.key}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-background p-6",
                  p.featured ? "border-primary shadow-xl shadow-brand/10 ring-1 ring-primary lg:-my-3 lg:py-9" : "border-border",
                )}
              >
                {p.featured ? (
                  <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-primary-foreground">
                    Most teams
                  </span>
                ) : null}
                <h3 className="text-base font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
                <p className="mt-5 font-display text-4xl font-semibold tracking-tight">
                  {p.price}
                  <span className="text-sm font-normal text-muted-foreground"> / month</span>
                </p>
                <ButtonLink href="/signup" className="mt-6" variant={p.featured ? "default" : "outline"}>
                  {p.cta}
                </ButtonLink>
                <p className="mt-6 text-xs font-medium text-muted-foreground">{p.lead}</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {p.items.map((t) => (
                    <li key={t} className="flex gap-2">
                      <Check size={16} className="mt-0.5 shrink-0 text-primary" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="flex flex-col rounded-2xl border border-border bg-background p-6">
              <h3 className="text-base font-semibold">Larger teams</h3>
              <p className="mt-1 text-sm text-muted-foreground">Volume, terms and support to match.</p>
              <p className="mt-5 font-display text-4xl font-semibold tracking-tight">Custom</p>
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Pricing`}
                className="mt-6 inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
              >
                Talk to us
              </a>
              <p className="mt-6 text-xs font-medium text-muted-foreground">Everything in Growth, plus</p>
              <ul className="mt-3 space-y-2 text-sm">
                {["Limits sized to your volume", "A data processing agreement", "A named contact"].map((t) => (
                  <li key={t} className="flex gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-primary" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-ink px-6 py-14 text-center text-ink-foreground sm:px-12 sm:py-20">
          <div aria-hidden className="bg-ink-glow pointer-events-none absolute inset-0" />
          <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_100%,black,transparent_70%)]" />
          <div className="relative">
            <LevelMeter level={5} tone="inverted" className="mx-auto h-8" />
            <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">How autonomous is your company?</h2>
            <p className="mx-auto mt-4 max-w-md text-white/65">Connect your tools and see the recurring work AutonomOS finds, in minutes.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href="/signup" size="lg" className="h-11 bg-highlight px-6 text-highlight-foreground hover:bg-highlight/90">
                Start free <ArrowRight size={16} />
              </ButtonLink>
              <ButtonLink href="/docs" size="lg" variant="outline" className="h-11 border-white/25 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white">
                Read the docs
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
  center,
  tone = "default",
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  center?: boolean;
  tone?: "default" | "inverted";
}) {
  const inverted = tone === "inverted";
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <p className={cn("eyebrow flex items-center gap-2", center && "justify-center", inverted ? "text-highlight" : "text-highlight-strong")}>
        <span aria-hidden className="h-3 w-1 rounded-full bg-highlight" />
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] sm:text-[2.75rem] sm:leading-[1.08]">{title}</h2>
      {children ? <p className={cn("mt-4 text-base sm:text-lg", inverted ? "text-white/65" : "text-muted-foreground")}>{children}</p> : null}
    </div>
  );
}
