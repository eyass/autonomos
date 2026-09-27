import { AUTONOMY_COEFFICIENTS, AUTONOMY_LEVELS, type AutonomyLevel } from "@autonomos/schemas";
import { ArrowRight, Ban, FlaskConical, Hand, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { LevelMeter } from "@/components/brand/logo";

// Product pictures for the landing page. All illustrative, built from the same furniture
// marketplace scenario as the sandbox, and drawn with the app's own tokens so they read as the
// product rather than stock art. Decorative detail is hidden from screen readers; each picture
// carries a label that says what it shows.

function Frame({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="img" aria-label={label} className={cn("rounded-xl border border-border bg-card p-3 text-left shadow-sm", className)}>
      <div aria-hidden>{children}</div>
    </div>
  );
}

// Step 1: the process inventory drafted from connected systems.
const PROCESSES = [
  { title: "Refund requests", source: "Zendesk", hours: 43 },
  { title: "Invoice questions", source: "Gmail", hours: 18 },
  { title: "Failed payment follow-up", source: "Stripe", hours: 11 },
];

export function InventoryVisual() {
  const max = Math.max(...PROCESSES.map((p) => p.hours));
  return (
    <Frame label="Example process inventory: refund requests 43 hours a month, invoice questions 18, failed payment follow-up 11">
      <p className="eyebrow text-muted-foreground">Found in your systems</p>
      <ul className="mt-2 space-y-2.5">
        {PROCESSES.map((p) => (
          <li key={p.title}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-medium">{p.title}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{p.hours} h/mo</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="h-1.5 flex-1 rounded-full bg-muted">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${(p.hours / max) * 100}%` }} />
              </span>
              <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">{p.source}</span>
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

// Step 2: the idea ranked by value, difficulty and risk, with the reason it is worth it.
function Dots({ value, tone }: { value: number; tone: "good" | "mid" }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn("size-1.5 rounded-full", i <= value ? (tone === "good" ? "bg-success" : "bg-warning") : "bg-border")} />
      ))}
    </span>
  );
}

export function OpportunityVisual() {
  return (
    <Frame label="Example automation idea: refund handling, value 5 of 5, difficulty 2 of 5, risk 3 of 5, an agent could take over about 17 hours a month">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Refund handling</p>
        <span className="rounded bg-highlight-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold text-highlight-strong">#1 idea</span>
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
        {[
          { k: "Value", v: 5, tone: "good" as const },
          { k: "Difficulty", v: 2, tone: "good" as const },
          { k: "Risk", v: 3, tone: "mid" as const },
        ].map((s) => (
          <div key={s.k} className="rounded-md bg-background px-2 py-1.5">
            <dt className="text-muted-foreground">{s.k}</dt>
            <dd className="mt-1">
              <Dots value={s.v} tone={s.tone} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
        <span className="font-medium text-foreground">Why it is worth it:</span> an agent could take over about 17 h a month; it touches money.
      </p>
    </Frame>
  );
}

// Step 3: the agent tested on sandbox data, then live under approvals.
export function AgentVisual() {
  return (
    <Frame label="Example agent: test passed on sandbox data, live at autonomy level 3, three runs waiting for approval">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <span className="signal-pulse size-1.5 rounded-full bg-highlight" />
          Refund agent
        </p>
        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-brand-strong">
          <LevelMeter level={3} className="h-2.5" /> L3
        </span>
      </div>
      <ol className="mt-2.5 space-y-1.5 text-[11px]">
        <li className="flex items-center gap-2 rounded-md bg-success-soft px-2 py-1.5 text-success">
          <FlaskConical size={12} /> Test passed, every write simulated
        </li>
        <li className="flex items-center gap-2 rounded-md bg-brand-soft px-2 py-1.5 text-brand-strong">
          <Play size={12} /> Live on new tickets
        </li>
        <li className="flex items-center gap-2 rounded-md bg-highlight-soft px-2 py-1.5 text-highlight-strong">
          <Hand size={12} /> 3 refunds waiting for your approval
        </li>
      </ol>
    </Frame>
  );
}

// The policy engine: every action an agent proposes passes the same checks, in code, and ends
// in one of three outcomes. The highlighted path is the hero's €72 refund.
const CHECKS = [
  { label: "Is the tool on the agent's allowlist?", result: "Yes" },
  { label: "Is the emergency stop on?", result: "No" },
  { label: "Over the €500 hard limit?", result: "No" },
  { label: "Over the €50 approval threshold?", result: "Yes", hot: true },
];

const OUTCOMES = [
  { icon: Play, title: "Runs", body: "Routine and within every limit", tone: "border-border bg-card text-foreground" },
  { icon: Hand, title: "Waits for a person", body: "An approval rule applies: this refund", tone: "border-highlight bg-highlight-soft text-highlight-strong ring-2 ring-highlight/30", hot: true },
  { icon: Ban, title: "Denied", body: "Off the allowlist, over a hard limit, or stopped", tone: "border-border bg-card text-foreground" },
];

export function PolicyFlow() {
  return (
    <figure className="rounded-2xl border border-border bg-background p-4 sm:p-6">
      <figcaption className="sr-only">
        How the policy engine decides: an agent proposes a €72 refund. The tool is allowed, the emergency stop is off, it is under the €500 hard limit and over the €50 approval threshold, so it waits
        for a person.
      </figcaption>
      <div aria-hidden className="grid items-center gap-4 lg:grid-cols-[1fr_auto_1.35fr_auto_1fr]">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="eyebrow text-muted-foreground">Agent proposes</p>
          <p className="mt-2 font-mono text-sm font-semibold">stripe.create_refund</p>
          <p className="mt-1 text-sm text-muted-foreground">€72.00 to the customer, reason: damaged delivery</p>
        </div>
        <Connector />
        <div className="rounded-xl border border-brand/30 bg-brand-soft/60 p-4">
          <p className="eyebrow flex items-center gap-2 text-brand-strong">
            <span className="h-3 w-1 rounded-full bg-brand" />
            Policy engine · in code
          </p>
          <ol className="mt-3 space-y-2">
            {CHECKS.map((c) => (
              <li key={c.label} className={cn("flex items-center justify-between gap-3 rounded-md bg-card px-3 py-2 text-sm", c.hot && "ring-1 ring-highlight")}>
                <span>{c.label}</span>
                <span className={cn("shrink-0 font-mono text-xs font-semibold", c.hot ? "text-highlight-strong" : "text-success")}>{c.result}</span>
              </li>
            ))}
          </ol>
        </div>
        <Connector />
        <ol className="grid gap-2">
          {OUTCOMES.map((o) => (
            <li key={o.title} className={cn("flex items-start gap-3 rounded-xl border p-3", o.tone, !o.hot && "opacity-70")}>
              <o.icon size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{o.title}</p>
                <p className={cn("text-xs", o.hot ? "" : "text-muted-foreground")}>{o.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}

function Connector() {
  return (
    <span className="flex items-center justify-center text-muted-foreground">
      <ArrowRight size={18} className="rotate-90 lg:rotate-0" />
    </span>
  );
}

// Hours of the example process an agent takes over at each level, from the same coefficients
// the product uses for its autonomy score. The track is the time people keep.
const TOTAL_HOURS = 43;

export function HoursByLevel() {
  const rows = AUTONOMY_LEVELS.map((l) => {
    const agent = Math.round(TOTAL_HOURS * AUTONOMY_COEFFICIENTS[l.level as AutonomyLevel] * 10) / 10;
    return { ...l, agent, people: Math.round((TOTAL_HOURS - agent) * 10) / 10 };
  });
  return (
    <figure className="rounded-xl border border-border bg-card p-5">
      <figcaption>
        <p className="text-base font-semibold">Where the 43 hours go at each level</p>
        <p className="mt-1 text-sm text-muted-foreground">Filled: hours the agent takes over each month. Track: hours your team keeps.</p>
      </figcaption>
      <div className="sr-only">
        <table>
          <thead>
            <tr>
              <th>Level</th>
              <th>Agent hours</th>
              <th>People hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td>
                  {r.code} {r.name}
                </td>
                <td>{r.agent}</td>
                <td>{r.people}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol aria-hidden className="mt-5 space-y-3">
        {rows.map((r) => (
          <li key={r.code} className="grid grid-cols-[2.25rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[2.25rem_1fr_9.5rem]">
            <span className="font-mono text-xs font-bold" style={{ color: `var(--level-${Math.max(r.level, 3)})` }}>
              {r.code}
            </span>
            <span className="flex h-3 gap-[2px] overflow-hidden rounded-full">
              {r.agent > 0 ? <span className="h-full rounded-full" style={{ width: `${(r.agent / TOTAL_HOURS) * 100}%`, background: r.level === 5 ? "var(--highlight)" : "var(--brand)" }} /> : null}
              {r.people > 0 ? <span className="h-full flex-1 rounded-full bg-muted" /> : null}
            </span>
            <span className="col-start-2 text-xs tabular-nums text-muted-foreground sm:col-start-auto sm:text-right">
              <span className="font-semibold text-foreground">{r.agent} h</span> agent · {r.people} h people
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">Illustrative: 320 requests at about 8 minutes each. Levels move one at a time, and an agent only moves up when its record earns it.</p>
    </figure>
  );
}
