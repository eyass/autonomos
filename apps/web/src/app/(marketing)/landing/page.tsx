import { ArrowRight, Bot, Check, FileSearch, Gauge, ListChecks, Lock, OctagonX, ScrollText, ShieldCheck, Target, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/components/marketing/site";
import { ButtonLink } from "@/components/app/button-link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const title = "AutonomOS: find the recurring work, deploy constrained AI agents";
const description = "AutonomOS finds the recurring work in your company, deploys constrained AI agents for it, and measures how autonomous you are becoming.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, url: "/", type: "website", siteName: "AutonomOS" },
};

const STEPS = [
  {
    icon: FileSearch,
    label: "Process",
    title: "Map the work",
    body: "AutonomOS reads your website and connected systems and drafts your process inventory. You review, correct and approve each process.",
  },
  {
    icon: Target,
    label: "Opportunity",
    title: "Choose what to automate",
    body: "Every process is ranked by value, difficulty and risk, with the evidence behind each score, so you start where an agent is both useful and safe.",
  },
  {
    icon: Bot,
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
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <Badge variant="secondary">Now accepting design partners</Badge>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl sm:leading-[1.1]">Automate the recurring work, with agents you can trust with real actions.</h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Recurring operational work eats your team&apos;s time. Most AI automation projects stall anyway, because nobody knows what to automate first, or trusts an agent to issue a refund or update
            a customer record.
          </p>
          <p className="mt-4 max-w-2xl text-base font-medium sm:text-lg">{description}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/signup" size="lg">
              Start free <ArrowRight size={16} />
            </ButtonLink>
            <ButtonLink href="#how-it-works" size="lg" variant="outline">
              See how it works
            </ButtonLink>
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
                <Card className="h-full p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <s.icon size={18} />
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      Step {i + 1} · {s.label}
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
          <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {LEVELS.map((l, i) => (
              <li key={l.level} className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center gap-2">
                  <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: `var(--level-${i + 1})` }}>
                    {l.level}
                  </span>
                  <span className="text-sm font-semibold">{l.name}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{l.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
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
      <section>
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 sm:py-20 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3">
            <Gauge size={22} className="mt-1 shrink-0 text-primary" />
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
      <p className="text-xs font-medium uppercase tracking-wide text-primary">{eyebrow}</p>
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
