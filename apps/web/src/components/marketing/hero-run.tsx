import { Activity, Bot, Check, CircleDot, Compass, Hand, LayoutGrid, ListChecks, ShieldCheck } from "lucide-react";
import { LevelMeter, LogoMark } from "@/components/brand/logo";
import { ToolLogo, type ToolSlug } from "./tools";

// The hero's product picture: one agent run as the app shows it, stopped at the approval a
// policy asked for, inside a window of the app. Illustrative, the same furniture-marketplace
// scenario as the sandbox.
const STEPS: Array<{ done: boolean; text: string; detail: string; tool?: ToolSlug; time: string }> = [
  { done: true, text: "Read the ticket", detail: "“Sofa arrived damaged, I'd like a refund”", tool: "zendesk", time: "09:41:02" },
  { done: true, text: "Found the payment", detail: "€72.00 · paid 12 Sep · card", tool: "stripe", time: "09:41:04" },
  { done: true, text: "Checked the refund policy", detail: "Damaged on delivery: eligible", time: "09:41:05" },
  { done: false, text: "Refund €72.00", detail: "Above €50, so a person approves", tool: "stripe", time: "09:41:05" },
];

const CHECKS = [
  { label: "Tool on the allowlist", ok: true },
  { label: "Under the €500 hard limit", ok: true },
  { label: "No prompt injection found", ok: true },
  { label: "Over the €50 approval limit", ok: false },
];

const NAV = [
  { icon: LayoutGrid, label: "Overview" },
  { icon: Compass, label: "Discover" },
  { icon: ListChecks, label: "Processes" },
  { icon: Bot, label: "Agents" },
  { icon: Hand, label: "Approvals", count: 3, active: true },
  { icon: Activity, label: "Activity" },
];

export function HeroRun() {
  return (
    <figure className="relative mx-auto w-full max-w-5xl" aria-label="Example: an agent run waiting for a person to approve a €72 refund">
      <div aria-hidden className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 rounded-[2.5rem] bg-highlight/15 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] p-1.5 shadow-2xl shadow-black/50 backdrop-blur sm:p-2">
        <div className="overflow-hidden rounded-xl bg-background text-left text-foreground">
          {/* Window chrome */}
          <div aria-hidden className="flex items-center gap-3 border-b border-border bg-card px-3 py-2.5">
            <span className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-border" />
              <span className="size-2.5 rounded-full bg-border" />
              <span className="size-2.5 rounded-full bg-border" />
            </span>
            <span className="mx-auto hidden rounded-md bg-muted px-3 py-0.5 font-mono text-[11px] text-muted-foreground sm:block">autonomos.ai/approvals</span>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-highlight-soft px-2 py-0.5 text-[11px] font-medium text-highlight-strong sm:ml-0">
              <span className="signal-pulse size-1.5 rounded-full bg-highlight" /> 1 agent working
            </span>
          </div>

          <div aria-hidden className="grid md:grid-cols-[11rem_1fr_16rem]">
            {/* Sidebar */}
            <nav className="hidden border-r border-border bg-sidebar p-3 md:block">
              <LogoMark className="size-6" />
              <ul className="mt-4 space-y-0.5 text-[13px]">
                {NAV.map((n) => (
                  <li
                    key={n.label}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${n.active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground"}`}
                  >
                    <n.icon size={14} />
                    <span className="flex-1">{n.label}</span>
                    {n.count ? <span className="rounded-full bg-highlight px-1.5 font-mono text-[10px] font-semibold leading-4 text-white">{n.count}</span> : null}
                  </li>
                ))}
              </ul>
              <div className="mt-6 rounded-lg border border-border bg-card p-2.5">
                <p className="eyebrow text-muted-foreground">Autonomy</p>
                <p className="mt-1 font-display text-2xl font-semibold leading-none text-brand">38%</p>
                <LevelMeter level={3} className="mt-2 h-3" />
              </div>
            </nav>

            {/* Run timeline */}
            <div className="min-w-0 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-muted-foreground">Run #1,284 · ticket 48213</p>
                  <p className="mt-0.5 truncate font-display text-base font-semibold sm:text-lg">Refund handling</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-brand-strong">
                  <LevelMeter level={3} className="h-3" /> L3
                </span>
              </div>
              <ol className="relative mt-4 space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-border">
                {STEPS.map((s) => (
                  <li key={s.text} className="relative flex gap-3">
                    <span
                      className={`z-10 flex size-6 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-success-soft text-success" : "bg-highlight text-white ring-4 ring-highlight-soft"}`}
                    >
                      {s.done ? <Check size={13} /> : <Hand size={12} />}
                    </span>
                    <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[13px] ${s.done ? "" : "font-semibold"}`}>{s.text}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">{s.time}</span>
                          {s.tool ? <ToolLogo tool={s.tool} size={16} className="border border-border" /> : <ShieldCheck size={15} className="text-brand" />}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Policy and approval */}
            <div className="border-t border-border bg-card p-4 md:border-t-0 md:border-l">
              <p className="eyebrow flex items-center gap-2 text-brand-strong">
                <span className="h-3 w-1 rounded-full bg-brand" /> Policy checked in code
              </p>
              <ul className="mt-3 space-y-1.5 text-xs">
                {CHECKS.map((c) => (
                  <li key={c.label} className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${c.ok ? "bg-background" : "bg-highlight-soft font-medium text-highlight-strong"}`}>
                    {c.ok ? <CircleDot size={12} className="shrink-0 text-success" /> : <Hand size={12} className="shrink-0" />}
                    {c.label}
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-lg border border-highlight/40 bg-background p-3">
                <p className="text-xs text-muted-foreground">Waiting for you</p>
                <p className="mt-0.5 font-display text-xl font-semibold">€72.00 refund</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <span className="inline-flex h-8 items-center justify-center rounded-md border border-border text-xs font-medium">Reject</span>
                  <span className="inline-flex h-8 items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground">Approve</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center font-mono text-[10px] uppercase tracking-wider text-white/45">Illustrative run · sandbox data</figcaption>
    </figure>
  );
}
