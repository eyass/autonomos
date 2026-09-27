import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// What each status means and what can be undone, next to the buttons that change it.
const LIFECYCLES = {
  opportunity: {
    flow: ["Suggested", "Approved", "Building", "Live"],
    notes: [
      ["Building", "An agent was created and is being tested with simulated actions."],
      ["Live", "The agent is active and does the work under its autonomy level."],
      ["Hold", "Pauses a live agent. Reopen to continue."],
      ["Reject", "Not worth automating now. A live agent is paused. Reopen to undo."],
      ["Done", "Finished and kept for the record. Reopen to undo."],
    ],
  },
  process: {
    flow: ["Draft", "Reviewed", "Active", "Archived"],
    notes: [
      ["Draft", "Drafted by AutonomOS or someone on the team. Check it, then approve."],
      ["Reviewed", "Approved. AutonomOS looks for ideas to automate it."],
      ["Active", "An agent handles part of this work."],
      ["Archived", "Hidden from lists and metrics. Restore to undo."],
    ],
  },
} as const;

export function LifecycleHelp({ kind }: { kind: keyof typeof LIFECYCLES }) {
  const l = LIFECYCLES[kind];
  return (
    <Popover>
      <PopoverTrigger className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" aria-label="What the statuses mean">
        <CircleHelp className="size-3.5" />
        How this works
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="start">
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs font-medium">
          {l.flow.map((s, i) => (
            <span key={s} className="inline-flex items-center gap-1">
              {i ? <span className="text-muted-foreground">→</span> : null}
              {s}
            </span>
          ))}
        </div>
        <dl className="space-y-1.5">
          {l.notes.map(([term, text]) => (
            <div key={term}>
              <dt className="font-medium">{term}</dt>
              <dd className="text-muted-foreground">{text}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
