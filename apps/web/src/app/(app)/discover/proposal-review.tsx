"use client";
import { Check, ChevronRight, RefreshCw, RotateCcw, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { approveProposalAction, rejectProposalAction, undoRejectProposalAction } from "./actions";
import type { DiscoveryRunView, ProposalStatus } from "@/server/system-discovery";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";

// Processes inferred from the kind of company, not seen in the data, have confidence 0.45 or lower.
const INFERRED = 0.45;

type Proposal = DiscoveryRunView["proposals"][number];
// The systems a proposal draws on, in the order its evidence names them.
const spans = (p: Proposal) => [...new Set(p.evidence.map((e) => e.source))].filter((s) => s !== "Company profile");
type Decision = { title: string; action: "approved" | "rejected" };

// Shows the proposals one at a time: add it, reject it (never suggested again), or decide later.
export function ProposalReview({ run, onReadAgain }: { run: DiscoveryRunView; onReadAgain: () => void }) {
  const [status, setStatus] = useState<Record<string, ProposalStatus>>(() => Object.fromEntries(run.proposals.map((p) => [p.title, p.status])));
  const [order, setOrder] = useState<string[]>(() => run.proposals.filter((p) => p.status === "pending").map((p) => p.title));
  const [history, setHistory] = useState<Decision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const byTitle = useMemo(() => new Map(run.proposals.map((p) => [p.title, p])), [run.proposals]);

  const reviewable = run.proposals.filter((p) => p.status !== "exists");
  const pending = order.filter((t) => status[t] === "pending");
  const current = pending[0] ? byTitle.get(pending[0]) : undefined;
  const approved = reviewable.filter((p) => status[p.title] === "approved");
  const rejected = reviewable.filter((p) => status[p.title] === "rejected");
  const done = reviewable.length - pending.length;

  const set = (title: string, s: ProposalStatus) => setStatus((m) => ({ ...m, [title]: s }));

  const decide = useCallback(
    async (p: Proposal, action: Decision["action"]) => {
      setError(null);
      set(p.title, action);
      setHistory((h) => [...h, { title: p.title, action }]);
      const r = action === "approved" ? await approveProposalAction(run.id, p.title) : await rejectProposalAction(run.id, p.title);
      if (!r.ok) {
        set(p.title, "pending");
        setHistory((h) => h.filter((d) => d.title !== p.title));
        setError(r.error);
      }
    },
    [run.id],
  );

  const later = (p: Proposal) => setOrder((o) => [...o.filter((t) => t !== p.title), p.title]);

  // Only a rejection can be undone here; an added process is a draft, archived from its page.
  const restore = async (title: string) => {
    setError(null);
    const r = await undoRejectProposalAction(run.id, title);
    if (!r.ok) return setError(r.error);
    set(title, "pending");
    setHistory((h) => h.filter((d) => d.title !== title));
    setOrder((o) => [title, ...o.filter((t) => t !== title)]);
  };
  const last = history.at(-1);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowRight") void decide(current, "approved");
      else if (e.key === "ArrowLeft") void decide(current, "rejected");
      else if (e.key === "ArrowDown") later(current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, decide]);

  if (!reviewable.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{run.proposals.length ? "Everything found is in your inventory" : "Nothing new found"}</CardTitle>
          {run.summary ? <CardDescription>{run.summary}</CardDescription> : null}
        </CardHeader>
        <Footer onReadAgain={onReadAgain} added={0} />
      </Card>
    );
  }

  return (
    <Card data-testid="proposal-review">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle>{current ? "Is this work you do?" : "All reviewed"}</CardTitle>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {current ? `${done + 1} of ${reviewable.length}` : `${reviewable.length} of ${reviewable.length}`} · {approved.length} added · {rejected.length} rejected
          </span>
        </div>
        <Progress value={(done / reviewable.length) * 100} aria-label="Review progress" />
        {run.summary && !done ? <CardDescription>{run.summary}</CardDescription> : null}
      </CardHeader>

      {error ? (
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      ) : null}

      {current ? (
        <>
          <CardContent key={current.title} className="space-y-4" data-testid="proposal">
            <div className="flex flex-wrap items-center gap-2">
              {current.confidence > INFERRED ? (
                <Badge variant="agent">
                  {spans(current).length >= 2
                    ? `Across ${spans(current).join(" + ")}`
                    : current.kind === "improvement"
                      ? `Opportunity for ${current.primarySystem ?? "your systems"}`
                      : current.primarySystem
                        ? `Seen in ${current.primarySystem}`
                        : "Seen in your data"}
                </Badge>
              ) : (
                <Badge variant="outline">Likely for a company like yours</Badge>
              )}
              {current.kind === "improvement" ? <Badge variant="info">New idea</Badge> : null}
              {current.department ? <Badge variant="secondary">{current.department}</Badge> : null}
              {current.confidence > INFERRED && current.confidence < 0.5 ? <Badge variant="warning">Weak evidence</Badge> : null}
            </div>
            <div className="space-y-1.5">
              <h3 className="font-display text-xl font-semibold leading-tight">{current.title}</h3>
              <p className="text-sm text-muted-foreground">{current.description}</p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {current.trigger ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Starts when</dt>
                  <dd>{current.trigger}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">Volume</dt>
                <dd>{volume(current)}</dd>
              </div>
            </dl>
            {current.automation ? (
              <div className="rounded-lg border border-highlight/30 bg-highlight-soft/40 p-3">
                <div className="text-xs font-medium text-highlight-strong">What an agent would do</div>
                <p className="mt-0.5 text-sm">{current.automation}</p>
              </div>
            ) : null}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{current.confidence > INFERRED ? "What the data shows" : "Why it is likely"}</div>
              <ul className="space-y-1 text-sm">
                {current.evidence.map((e, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="shrink-0 font-medium">{e.source}:</span>
                    <span className="text-muted-foreground">{e.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
            {current.steps.length ? (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">How it is done today</div>
                <ol className="list-decimal space-y-0.5 pl-5 text-sm">
                  {current.steps.slice(0, 8).map((s, i) => (
                    <li key={i}>{s.title}</li>
                  ))}
                </ol>
              </div>
            ) : null}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" onClick={() => void decide(current, "rejected")} aria-label={`Reject ${current.title}`}>
                <X />
                Not something we do
              </Button>
              <Button size="lg" onClick={() => void decide(current, "approved")} aria-label={`Approve ${current.title}`}>
                <Check />
                Add to inventory
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <Button variant="ghost" size="sm" onClick={() => later(current)} disabled={pending.length < 2}>
                Decide later
                <ChevronRight />
              </Button>
              {last?.action === "rejected" ? (
                <Button variant="ghost" size="sm" onClick={() => void restore(last.title)}>
                  <Undo2 />
                  Undo reject
                </Button>
              ) : (
                <span className="hidden sm:inline">Keys: ← reject · → add · ↓ later</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Rejected processes are never suggested again. Added ones become drafts you can edit.</p>
          </CardFooter>
        </>
      ) : (
        <>
          <CardContent className="space-y-3 text-sm">
            <p>
              {approved.length ? `${approved.length} process${approved.length === 1 ? "" : "es"} added to your inventory as drafts.` : "Nothing added this time."}{" "}
              {rejected.length ? `${rejected.length} rejected and will not be suggested again.` : ""}
            </p>
            {rejected.length ? (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="link" size="sm" className="h-auto px-0 text-xs">
                    Show rejected ({rejected.length})
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="mt-2 space-y-1">
                    {rejected.map((p) => (
                      <li key={p.title} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5">
                        <span className="min-w-0 truncate">{p.title}</span>
                        <Button variant="ghost" size="sm" onClick={() => void restore(p.title)}>
                          <RotateCcw />
                          Restore
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </CardContent>
          <Footer onReadAgain={onReadAgain} added={approved.length} />
        </>
      )}
    </Card>
  );
}

function Footer({ onReadAgain, added }: { onReadAgain: () => void; added: number }) {
  return (
    <CardFooter className="flex-wrap gap-2">
      {added ? (
        <Button asChild>
          <Link href="/processes?status=draft">Review the new drafts</Link>
        </Button>
      ) : null}
      <Button asChild variant="outline">
        <Link href="/discover?tab=interview">Tell us about other work</Link>
      </Button>
      <Button variant="ghost" onClick={onReadAgain}>
        <RefreshCw />
        Read again
      </Button>
    </CardFooter>
  );
}

function volume(p: Proposal) {
  const n = p.estimatedOccurrencesPerMonth ?? 0;
  const hours = (n * (p.estimatedMinutesPerOccurrence ?? 0)) / 60;
  if (!n) return "Unknown";
  return `About ${Math.round(n)} a month${hours >= 0.5 ? `, about ${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"} of work` : ""}`;
}
