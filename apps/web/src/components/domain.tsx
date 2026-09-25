import { AUTONOMY_LEVELS } from "@autonomos/schemas";
import { Bot, Check, User, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "./ui";

// Always show the autonomy vocabulary with the current level highlighted (PRD section 111).
export function AutonomyLadder({ current, target, size = "md" }: { current: number; target?: number | null; size?: "sm" | "md" }) {
  return (
    <div className="inline-flex items-center gap-1" aria-label={`Autonomy L${current}${target ? `, target L${target}` : ""}`}>
      {AUTONOMY_LEVELS.map((l) => {
        const isCurrent = l.level === current;
        const isTarget = target && l.level === target && target !== current;
        const reached = l.level <= current;
        return (
          <span
            key={l.level}
            title={`${l.code} ${l.name}: ${l.short}`}
            className={cn(
              "inline-flex items-center justify-center rounded font-semibold tabular-nums",
              size === "sm" ? "h-5 w-6 text-[10px]" : "h-6 w-8 text-xs",
              isCurrent ? "text-white" : reached ? "text-white/90" : "bg-surface-muted text-muted",
              isTarget && "ring-2 ring-accent ring-offset-1 ring-offset-surface text-accent bg-accent-soft",
            )}
            style={reached ? { background: `var(--level-${l.level})`, opacity: isCurrent ? 1 : 0.55 } : undefined}
          >
            {l.code}
          </span>
        );
      })}
    </div>
  );
}

export function AutonomyLegend() {
  return (
    <ul className="grid gap-2 text-sm sm:grid-cols-5">
      {AUTONOMY_LEVELS.map((l) => (
        <li key={l.level} className="rounded-md border border-border bg-surface px-3 py-2">
          <div className="text-xs font-semibold" style={{ color: `var(--level-${Math.max(l.level, 3)})` }}>
            {l.code} · {l.name}
          </div>
          <div className="mt-0.5 text-xs text-muted">{l.short}</div>
        </li>
      ))}
    </ul>
  );
}

export function ScorePill({ value, kind }: { value: number | null | undefined; kind: "value" | "difficulty" | "risk" }) {
  if (!value) return <span className="text-muted">–</span>;
  const good = kind === "value" ? value >= 4 : value <= 2;
  const bad = kind === "value" ? value <= 2 : value >= 4;
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-8 items-center justify-center rounded px-1.5 text-xs font-semibold tabular-nums",
        good ? "bg-ok-soft text-ok" : bad ? (kind === "risk" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn") : "bg-surface-muted text-foreground",
      )}
      title={`${kind} ${value} of 5`}
    >
      {value}/5
    </span>
  );
}

const STATUS_TONES: Record<string, "neutral" | "accent" | "ok" | "warn" | "danger" | "info"> = {
  draft: "neutral",
  reviewed: "info",
  active: "ok",
  archived: "neutral",
  suggested: "info",
  reviewing: "warn",
  approved: "ok",
  building: "accent",
  live: "ok",
  rejected: "danger",
  testing: "info",
  paused: "warn",
  error: "danger",
  queued: "neutral",
  running: "accent",
  waiting_for_approval: "warn",
  completed: "ok",
  failed: "danger",
  cancelled: "neutral",
  pending: "warn",
  modified: "info",
  expired: "neutral",
  connected: "ok",
  disconnected: "neutral",
};

const STATUS_LABELS: Record<string, string> = {
  waiting_for_approval: "Needs your approval",
  event_driven: "When it happens",
};

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status.replaceAll("_", " ");
  return (
    <Badge tone={STATUS_TONES[status] ?? "neutral"} className="capitalize">
      {label}
    </Badge>
  );
}

export function OutcomeBadge({ outcome, mode }: { outcome: string | null; mode?: string }) {
  if (!outcome) return null;
  const map: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "info" }> = {
    completed: { label: "Done", tone: "ok" },
    drafted: { label: "Drafted for a human", tone: "info" },
    test_completed: { label: "Test finished", tone: "info" },
    escalated: { label: "Handed to a human", tone: "warn" },
    unsuccessful: { label: "Not completed", tone: "warn" },
    failed: { label: "Failed", tone: "danger" },
    cancelled: { label: "Stopped", tone: "neutral" },
  };
  const m = map[outcome] ?? { label: outcome, tone: "neutral" as const };
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone={m.tone}>{m.label}</Badge>
      {mode === "test" ? <Badge tone="neutral">Test</Badge> : null}
    </span>
  );
}

type FlowStep = { title: string; actor: "agent" | "human" | "system"; approval?: boolean };

// Before/after comparison, central to understanding an opportunity (PRD section 110).
export function BeforeAfter({ today, proposed }: { today: Array<{ title: string; performedBy?: string | null }>; proposed: FlowStep[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FlowColumn title="Today" subtitle="Human-led" steps={today.map((s) => ({ title: s.title, actor: /customer|system/i.test(s.performedBy ?? "") ? "system" : "human" }))} />
      <FlowColumn title="Proposed" subtitle="Agent-led" steps={proposed} highlight />
    </div>
  );
}

function FlowColumn({ title, subtitle, steps, highlight }: { title: string; subtitle: string; steps: FlowStep[]; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-4", highlight ? "border-accent/40 bg-accent-soft/40" : "border-border bg-surface")}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
        <span className="text-xs text-muted">{subtitle}</span>
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                s.actor === "agent" ? "bg-accent text-white" : s.actor === "human" ? "bg-warn-soft text-warn" : "bg-surface-muted text-muted",
              )}
            >
              {s.actor === "agent" ? <Bot size={12} /> : s.actor === "human" ? <User size={12} /> : <Workflow size={12} />}
            </span>
            <span>
              {s.title}
              {s.approval ? (
                <Badge tone="warn" className="ml-2">
                  <Check size={10} /> approval
                </Badge>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
