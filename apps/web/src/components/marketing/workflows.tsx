import { ArrowRight, Hand, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { LevelMeter } from "@/components/brand/logo";
import { TOOLS, ToolLogo, type ToolSlug } from "./tools";

// How agents chain tools: each example is one trigger and the tool calls that follow, with the
// steps a person approves marked. Illustrative workflows, not customers.
type Step = { tool: ToolSlug | "policy"; action: string; gate?: string };
type Flow = { title: string; level: number; steps: Step[] };

const FLOWS: Flow[] = [
  {
    title: "Refund request",
    level: 3,
    steps: [
      { tool: "zendesk", action: "Read the ticket" },
      { tool: "stripe", action: "Find the payment" },
      { tool: "policy", action: "Check refund policy" },
      { tool: "stripe", action: "Refund €72", gate: "Approval above €50" },
      { tool: "zendesk", action: "Reply and close" },
    ],
  },
  {
    title: "New inbound lead",
    level: 4,
    steps: [
      { tool: "hubspot", action: "New form lead" },
      { tool: "salesforce", action: "Check for an existing account" },
      { tool: "google", action: "Offer meeting slots" },
      { tool: "slack", action: "Tell the account owner" },
    ],
  },
  {
    title: "Overdue invoice",
    level: 3,
    steps: [
      { tool: "xero", action: "Invoice 14 days overdue" },
      { tool: "stripe", action: "Check for a payment" },
      { tool: "outlook", action: "Send a reminder", gate: "Every write approved" },
      { tool: "slack", action: "Escalate above €1,000" },
    ],
  },
  {
    title: "Delayed order",
    level: 4,
    steps: [
      { tool: "shopify", action: "Order past its ship date" },
      { tool: "intercom", action: "Tell the customer" },
      { tool: "atlassian", action: "Open a Jira issue for ops" },
    ],
  },
];

function Node({ step }: { step: Step }) {
  return (
    <li className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2 md:flex-col md:items-start md:gap-2 md:px-3 md:py-3">
      {step.tool === "policy" ? (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-white">
          <ShieldCheck size={15} />
        </span>
      ) : (
        <ToolLogo tool={step.tool} size={28} className="border border-border" />
      )}
      <span className="min-w-0">
        <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{step.tool === "policy" ? "Policy engine" : TOOLS[step.tool]}</span>
        <span className="block text-sm font-medium leading-snug">{step.action}</span>
        {step.gate ? (
          <span className="mt-1 inline-flex items-center gap-1 rounded bg-highlight-soft px-1.5 py-0.5 text-[11px] font-medium text-highlight-strong">
            <Hand size={11} /> {step.gate}
          </span>
        ) : null}
      </span>
    </li>
  );
}

export function WorkflowChains() {
  return (
    <div className="grid gap-4">
      {FLOWS.map((f) => (
        <figure key={f.title} className="rounded-2xl border border-border bg-background p-4 sm:p-5" aria-label={`${f.title}: ${f.steps.map((s) => s.action).join(", then ")}`}>
          <figcaption className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{f.title}</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-brand-strong">
              <LevelMeter level={f.level} className="h-3" /> L{f.level}
            </span>
          </figcaption>
          <ol
            aria-hidden
            className={cn(
              "grid gap-2 md:items-stretch md:gap-0",
              f.steps.length === 5
                ? "md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]"
                : f.steps.length === 4
                  ? "md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]"
                  : "md:grid-cols-[1fr_auto_1fr_auto_1fr]",
            )}
          >
            {f.steps.map((s, i) => (
              <Fragmented key={`${s.tool}-${i}`} last={i === f.steps.length - 1}>
                <Node step={s} />
              </Fragmented>
            ))}
          </ol>
        </figure>
      ))}
    </div>
  );
}

function Fragmented({ children, last }: { children: React.ReactNode; last: boolean }) {
  return (
    <>
      {children}
      {last ? null : (
        <li className="hidden items-center justify-center px-1.5 text-muted-foreground md:flex" aria-hidden>
          <ArrowRight size={14} />
        </li>
      )}
    </>
  );
}
