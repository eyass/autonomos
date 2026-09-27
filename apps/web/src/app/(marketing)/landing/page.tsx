import { OG_IMAGES } from "@/components/marketing/config";
import { ArrowRight, Bot, Check, FileSearch, ListChecks, Lock, OctagonX, ScrollText, ShieldCheck, Target, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/components/marketing/site";
import { HeroRun } from "@/components/marketing/hero-run";
import { AgentVisual, HoursByLevel, InventoryVisual, OpportunityVisual, PolicyFlow, SetupFlow, TOOL_COUNT } from "@/components/marketing/visuals";
import { LevelMeter } from "@/components/brand/logo";
import { ButtonLink } from "@/components/app/button-link";
import { Badge } from "@/components/ui/badge";
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
  {
    icon: FileSearch,
    visual: InventoryVisual,
    label: "Process",
    title: "Map the work",
    body: "AutonomOS reads your website and connected systems and drafts your process inventory. You review, correct and approve each process.",
  },
  {
    icon: Target,
    visual: OpportunityVisual,
    label: "Opportunity",
    title: "Choose what to automate",
    body: "Every process is ranked by value, difficulty and risk, with the evidence behind each score, so you start where an agent is both useful and safe.",
  },
  {
    icon: Bot,
    visual: AgentVisual,
    label: "Agent",
    title: "Deploy under control",
    body: "AutonomOS builds a constrained agent, tests it with every action simulated, then runs it under approvals at an autonomy level from L1 to L5.",
  },
];

const LEVELS = [
  { level: "L1", name: "Human only", body: "People do the work. AutonomOS measures it." },
  { level: "L2", name: "Agent assists", body: "The agent gathers context and drafts. A person acts." },
  { level: "L3", name: "Agent proposes", body: "The agent prepares each action and a person approves it." },
  { level: "L4", name: "Agent executes", body: "The agent acts on routine cases and escalates exceptions." },
  { level: "L5", name: "Autonomous", body: "The agent runs the process end to end within its limits." },
];

const FACTS = [
  { value: TOOL_COUNT, label: "tools you can connect" },
  { value: "5 levels", label: "of autonomy, raised one at a time" },
  { value: "0", label: "live writes while an agent is tested" },
];

const CONTROLS = [
  { icon: ListChecks, title: "Explicit tool allowlists", body: "Each agent can call only the tools it was given. Everything else is out of reach." },
  { icon: ShieldCheck, title: "Deterministic policy engine", body: "Rules are evaluated in code before every write, not left to the model's judgement." },
  { icon: Wallet, title: "Money limits and hard limits", body: "Amounts above a threshold need approval. Hard limits deny an action even after approval." },
  { icon: OctagonX, title: "Emergency stop", body: "One switch pauses every agent. It is checked before each external write." },
  { icon: ScrollText, title: "Append-only audit log", body: "Every run, action, approval and configuration change is recorded and cannot be edited." },
  { icon: Lock, title: "Sandbox first", body: "Test runs simulate every write. Live accounts are touched only in production runs." },
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
            <span className="eyebrow inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-white/80">
              <span aria-hidden className="signal-pulse size-1.5 rounded-full bg-highlight" />
              Now accepting design partners
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.03em] sm:text-6xl sm:leading-[1.02]">
              Automate the recurring work, with agents you can <span className="text-highlight">trust with real actions.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base text-white/70 sm:text-lg">
              Most AI automation stalls: nobody knows what to automate first, or trusts an agent to issue a refund or update a customer record. {description}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/signup" size="lg" className="bg-highlight text-highlight-foreground hover:bg-highlight/90">
                Start free <ArrowRight size={16} />
              </ButtonLink>
              <ButtonLink href="#how-it-works" size="lg" variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white">
                See how it works
              </ButtonLink>
            </div>
            <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 font-mono text-xs text-white/55">
              <div className="flex items-center gap-2">
                <LevelMeter level={5} tone="inverted" className="h-3" />
                <dt className="sr-only">Autonomy</dt>
                <dd>L1 to L5, raised one level at a time</dd>
              </div>
              <div>
                <dt className="sr-only">Tools</dt>
                <dd>{TOOL_COUNT} tools, connected in minutes</dd>
              </div>
              <div>
                <dt className="sr-only">Safety</dt>
                <dd>Every write checked in code</dd>
              </div>
            </dl>
          </div>
          <div className="flex justify-center pb-8 lg:justify-end">
            <HeroRun />
          </div>
        </div>
      </section>

      {/* Proof strip: what it reads and the facts that hold for every agent */}
      <section aria-label="At a glance" className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-[1.2fr_2fr] md:items-center">
          <div>
            <p className="eyebrow text-muted-foreground">Connects to the tools you already use</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {["Gmail", "Slack", "HubSpot", "Stripe", "Zendesk"].map((n) => (
                <li key={n} className="rounded-md border border-border bg-background px-2.5 py-1 font-mono text-xs font-semibold">
                  {n}
                </li>
              ))}
              <li>
                <a href="#setup" className="block rounded-md border border-dashed border-border px-2.5 py-1 font-mono text-xs text-muted-foreground hover:text-foreground">
                  + {TOOL_COUNT} more
                </a>
              </li>
            </ul>
          </div>
          <dl className="grid grid-cols-3 gap-4 border-t border-border pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-8">
            {FACTS.map((f) => (
              <div key={f.label}>
                <dt className="sr-only">{f.label}</dt>
                <dd className="font-display text-2xl font-semibold tracking-tight sm:text-4xl">{f.value}</dd>
                <dd className="mt-1 text-xs text-muted-foreground sm:text-sm">{f.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Setup */}
      <section id="setup" className="scroll-mt-16 border-b border-border bg-brand-soft/50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <SectionHeading eyebrow="Setup" title="Up and running in minutes">
              Add your website, connect the tools you already use, and build your first agent. No engineers, no integration project.
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
          <SectionHeading eyebrow="How it works" title="From process to agent in three steps">
            Each step produces something you can read and approve before the next one starts.
          </SectionHeading>
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
                  <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Control plane */}
      <section id="control" className="scroll-mt-16 border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading eyebrow="Control plane" title="Autonomy you raise one level at a time">
            Every agent runs at an explicit autonomy level. You move it up when its record earns it, and down the moment it does not.
          </SectionHeading>
          <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            {LEVELS.map((l, i) => (
              <li key={l.level} className="flex flex-col rounded-lg border border-border bg-background p-4 lg:min-h-[var(--h)]" style={{ "--h": `${9 + i * 2.25}rem` } as React.CSSProperties}>
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
          <div className="mt-14 max-w-2xl">
            <h3 className="text-lg font-semibold tracking-tight sm:text-xl">Every action passes the same checks, in code</h3>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">The model proposes; the policy engine decides. Here is the €72 refund from the top of the page.</p>
          </div>
          <div className="mt-6">
            <PolicyFlow />
          </div>
          <div className="mt-12 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {CONTROLS.map((c) => (
              <div key={c.title} className="flex gap-3">
                <c.icon size={18} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">{c.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-10 text-sm">
            <ButtonLink href="/security" variant="link">
              Read how security works <ArrowRight size={14} />
            </ButtonLink>
          </p>
        </div>
      </section>

      {/* Worked example */}
      <section id="example" className="scroll-mt-16 border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading eyebrow="Example" title="Refund handling at a second-hand furniture marketplace">
            An illustrative scenario, not a customer. It is the same scenario the sandbox data and the product demo use.
          </SectionHeading>
          <div className="mt-10 grid gap-4 lg:grid-cols-5">
            <Card className="p-5 lg:col-span-2">
              <Badge variant="secondary">Example</Badge>
              <dl className="mt-4 space-y-3 text-sm">
                <ExampleRow label="Systems" value="Zendesk and Stripe" />
                <ExampleRow label="Volume" value="About 320 refund requests a month" />
                <ExampleRow label="Handling time" value="About 8 minutes each" />
                <ExampleRow label="Work involved" value="About 43 hours a month" />
              </dl>
            </Card>
            <Card className="p-5 lg:col-span-3">
              <h3 className="text-base font-semibold">What the agent does</h3>
              <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
                {[
                  "Reads the ticket, finds the customer and their payments in Stripe, and checks refund eligibility against your policy.",
                  "At L3, prepares the refund, the reply and the ticket update, and a person approves each one.",
                  "At L4, issues routine refunds itself and asks for approval above your money threshold or when the customer had a recent refund.",
                  "Escalates tickets that contain instructions aimed at the agent without taking any action.",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-primary" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <div className="mt-4">
            <HoursByLevel />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-16 border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading eyebrow="Pricing" title="Work with us as a design partner">
            We are working closely with a small number of companies while the product takes shape.
          </SectionHeading>
          <Card className="mt-10 max-w-xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold">Design partner programme</h3>
              <Badge variant="secondary">Free during the programme</Badge>
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {["Full product, free during the design partnership", "A direct Slack line to the team building it", "Shape the roadmap with your own processes"].map((t) => (
                <li key={t} className="flex gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-primary" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Design%20partner`}
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
            >
              Apply to be a design partner
            </a>
            <p className="mt-4 text-xs text-muted-foreground">Usage-based pricing after the programme; no per-seat fees. We will agree pricing with design partners before the programme ends.</p>
          </Card>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-grid-light">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 sm:py-20 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3">
            <LevelMeter level={5} tone="signal" className="mt-1.5 h-5" />
            <div>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">How autonomous is your company?</h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">Set up your company in a few minutes. Your first agent runs on sandbox data before it touches a live account.</p>
            </div>
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

function ExampleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
