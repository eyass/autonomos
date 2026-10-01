import { AUTONOMY_LEVELS, modeOf } from "@autonomos/schemas";
import { LevelMeter } from "@/components/brand/logo";
import { Bot, Check, User, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// The modes in order with the current one highlighted (PRD section 111): words, never numbers.
export function AutonomyLadder({ current, target, size = "md" }: { current: number; target?: number | null; size?: "sm" | "md" }) {
  const now = modeOf(current);
  const goal = target ? modeOf(target) : null;
  return (
    <div className="inline-flex items-center gap-1" aria-label={`Mode: ${now.name}${goal && goal.level !== now.level ? `, could go to ${goal.name}` : ""}`}>
      {AUTONOMY_LEVELS.map((l) => {
        const isCurrent = l.level === now.level;
        const isTarget = goal && l.level === goal.level && goal.level !== now.level;
        const reached = l.level <= now.level;
        return (
          <span
            key={l.level}
            title={`${l.name}: ${l.short}`}
            className={cn(
              "inline-flex items-center justify-center rounded px-1.5 font-semibold",
              size === "sm" ? "h-5 text-[10px]" : "h-6 text-xs",
              isCurrent ? "text-white" : reached ? "bg-brand-soft text-brand-strong" : "bg-muted text-muted-foreground",
              isTarget && "ring-2 ring-primary ring-offset-1 ring-offset-surface text-primary bg-primary/10",
            )}
            style={isCurrent ? { background: `var(--level-${Math.max(l.level + 1, 3)})` } : undefined}
          >
            {l.name}
          </span>
        );
      })}
    </div>
  );
}

export function AutonomyLegend() {
  return (
    <ul className="grid gap-2 text-sm sm:grid-cols-4">
      {AUTONOMY_LEVELS.map((l) => (
        <li key={l.level} className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-xs font-semibold" style={{ color: `var(--level-${Math.max(l.level + 1, 3)})` }}>
            {l.name}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{l.short}</div>
        </li>
      ))}
    </ul>
  );
}

// The mode of an agent or process as a small labelled meter, for lists and headers.
export function ModeBadge({ level, className }: { level: number; className?: string }) {
  const m = modeOf(level);
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap font-medium", className)} title={m.short}>
      <LevelMeter level={m.level} className="h-3" />
      {m.name}
    </span>
  );
}

export function ScorePill({ value, kind }: { value: number | null | undefined; kind: "value" | "difficulty" | "risk" }) {
  if (!value) return <span className="text-muted-foreground">–</span>;
  const good = kind === "value" ? value >= 4 : value <= 2;
  const bad = kind === "value" ? value <= 2 : value >= 4;
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-8 items-center justify-center rounded px-1.5 text-xs font-semibold tabular-nums",
        good ? "bg-success-soft text-success" : bad ? (kind === "risk" ? "bg-destructive-soft text-destructive" : "bg-warning-soft text-warning") : "bg-muted text-foreground",
      )}
      title={`${kind} ${value} of 5`}
    >
      {value}/5
    </span>
  );
}

// Value, difficulty and risk together, labelled, so the numbers read without a legend.
export function Scores({ value, difficulty, risk, className }: { value: number | null | undefined; difficulty: number | null | undefined; risk: number | null | undefined; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-1">
        Value <ScorePill kind="value" value={value} />
      </span>
      <span className="inline-flex items-center gap-1">
        Difficulty <ScorePill kind="difficulty" value={difficulty} />
      </span>
      <span className="inline-flex items-center gap-1">
        Risk <ScorePill kind="risk" value={risk} />
      </span>
    </div>
  );
}

// "Manual → Auto": the mode something runs in and the one it could reach.
export function LevelChange({ from, to }: { from: number; to?: number | null }) {
  const a = modeOf(from);
  const b = to ? modeOf(to) : null;
  return (
    <span className="whitespace-nowrap font-medium">
      {a.name}
      {b && b.level !== a.level ? <span className="text-muted-foreground"> → {b.name}</span> : null}
    </span>
  );
}

const STATUS_TONES: Record<string, "secondary" | "outline" | "success" | "warning" | "danger" | "info" | "agent"> = {
  draft: "secondary",
  reviewed: "info",
  active: "success",
  archived: "secondary",
  suggested: "info",
  reviewing: "warning",
  approved: "success",
  building: "outline",
  live: "agent",
  rejected: "danger",
  testing: "info",
  paused: "warning",
  error: "danger",
  queued: "secondary",
  running: "agent",
  waiting_for_approval: "warning",
  completed: "success",
  failed: "danger",
  cancelled: "secondary",
  pending: "warning",
  modified: "info",
  expired: "secondary",
  connected: "success",
  disconnected: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  waiting_for_approval: "Needs your approval",
  reviewing: "On hold",
  event_driven: "When it happens",
};

// Opportunities share some status names with processes and agents but mean something else
// by them, so they get their own words, matching the lifecycle help on the page.
const OPPORTUNITY_LABELS: Record<string, string> = {
  suggested: "Suggested",
  reviewing: "On hold",
  approved: "Approved",
  building: "Building",
  live: "Live",
  rejected: "Rejected",
  archived: "Done",
};

export function StatusBadge({ status, kind }: { status: string; kind?: "opportunity" }) {
  const label = (kind === "opportunity" ? OPPORTUNITY_LABELS[status] : undefined) ?? STATUS_LABELS[status] ?? status.replaceAll("_", " ");
  return (
    <Badge variant={STATUS_TONES[status] ?? "secondary"} className="capitalize">
      {label}
    </Badge>
  );
}

export function OutcomeBadge({ outcome, mode }: { outcome: string | null; mode?: string }) {
  if (!outcome) return null;
  const map: Record<string, { label: string; tone: "success" | "warning" | "danger" | "secondary" | "info" }> = {
    completed: { label: "Done", tone: "success" },
    drafted: { label: "Drafted for a human", tone: "info" },
    // test_completed is the older name, from before passed and unsuccessful tests were told apart.
    test_completed: { label: "Test finished", tone: "info" },
    test_passed: { label: "Test passed", tone: "success" },
    test_unsuccessful: { label: "Test did not pass", tone: "warning" },
    escalated: { label: "Handed to a human", tone: "warning" },
    unsuccessful: { label: "Not completed", tone: "warning" },
    failed: { label: "Failed", tone: "danger" },
    cancelled: { label: "Stopped", tone: "secondary" },
  };
  const m = map[outcome] ?? { label: outcome, tone: "secondary" as const };
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={m.tone}>{m.label}</Badge>
      {mode === "test" ? <Badge variant="secondary">Test</Badge> : null}
    </span>
  );
}

type FlowStep = { title: string; actor: "agent" | "human" | "system"; approval?: boolean };

// Before/after comparison, central to understanding an opportunity (PRD section 110).
export function BeforeAfter({ today, proposed }: { today: Array<{ title: string; performedBy?: string | null }>; proposed: FlowStep[] }) {
  return (
    <div className={cn("grid gap-4", today.length ? "md:grid-cols-2" : "")}>
      {today.length ? <FlowColumn title="Today" subtitle="Human-led" steps={today.map((s) => ({ title: s.title, actor: /customer|system/i.test(s.performedBy ?? "") ? "system" : "human" }))} /> : null}
      <FlowColumn title="Proposed" subtitle="Agent-led" steps={proposed} highlight />
    </div>
  );
}

function FlowColumn({ title, subtitle, steps, highlight }: { title: string; subtitle: string; steps: FlowStep[]; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-4", highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card")}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                s.actor === "agent" ? "bg-primary text-white" : s.actor === "human" ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground",
              )}
            >
              {s.actor === "agent" ? <Bot size={12} /> : s.actor === "human" ? <User size={12} /> : <Workflow size={12} />}
            </span>
            <span>
              {s.title}
              {s.approval ? (
                <Badge variant="warning" className="ml-2">
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
