import { Check, CircleDot, Hand } from "lucide-react";
import { LevelMeter } from "@/components/brand/logo";
import { ToolLogo, type ToolSlug } from "./tools";

// The hero's product picture: one agent run as the app shows it, stopped at the approval a
// policy asked for. Illustrative, the same furniture-marketplace scenario as the sandbox.
const STEPS: Array<{ done: boolean; text: string; tool?: ToolSlug }> = [
  { done: true, text: "Read ticket: sofa arrived damaged", tool: "zendesk" },
  { done: true, text: "Found the payment: €72.00", tool: "stripe" },
  { done: true, text: "Refund policy: eligible" },
  { done: false, text: "Above €50: a person approves", tool: "stripe" },
];

const CHECKS = ["Tool allowed", "Under the €500 cap", "No prompt injection"];

export function HeroRun() {
  return (
    <figure
      className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white text-foreground shadow-2xl shadow-black/40"
      aria-label="Example: an agent run waiting for a person to approve a refund"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="signal-pulse size-2 shrink-0 rounded-full bg-highlight" aria-hidden />
          <span className="truncate text-sm font-semibold">Refund handling</span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand-strong">
          <LevelMeter level={3} className="h-3" /> Approve
        </span>
      </div>
      <ol className="space-y-2.5 px-4 py-4 text-[13px] leading-snug">
        {STEPS.map((s) => (
          <li key={s.text} className="flex items-center gap-2.5">
            {s.done ? <Check size={15} className="shrink-0 text-success" aria-hidden /> : <Hand size={15} className="shrink-0 text-highlight-strong" aria-hidden />}
            <span className={`flex-1 ${s.done ? "text-muted-foreground" : "font-medium"}`}>{s.text}</span>
            {s.tool ? <ToolLogo tool={s.tool} size={18} className="border border-border" /> : null}
          </li>
        ))}
      </ol>
      <div className="mx-4 rounded-lg border border-border bg-background px-3 py-2.5">
        <p className="eyebrow text-muted-foreground">Policy checked in code</p>
        <ul className="mt-1.5 space-y-1 text-xs">
          {CHECKS.map((c) => (
            <li key={c} className="flex items-center gap-2">
              <CircleDot size={12} className="shrink-0 text-brand" aria-hidden />
              {c}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <span className="text-xs text-muted-foreground">Waiting for you</span>
        <div className="flex gap-2" aria-hidden>
          <span className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium">Reject</span>
          <span className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">Approve €72.00</span>
        </div>
      </div>
      <figcaption className="absolute -bottom-7 left-0 font-mono text-[10px] uppercase tracking-wider text-white/45">Illustrative run · sandbox data</figcaption>
    </figure>
  );
}
