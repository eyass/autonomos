"use client";
import { CircleAlert, CircleCheck, CircleDashed, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { acceptProposalsAction, proposeAction, scanSystemAction, startDiscoveryAction } from "./actions";
import type { DiscoveryRunView, RunSystem } from "@/server/system-discovery";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";

type Phase = "idle" | "reading" | "proposing" | "ready" | "error";

const defaultPicks = (run: DiscoveryRunView) => new Set(run.proposals.filter((p) => !p.exists && !run.accepted.includes(p.title) && p.confidence >= 0.5).map((p) => p.title));

// Reads every connected system, one at a time so progress is real, then proposes processes
// with the evidence behind each. Starts on its own when there is no recent result.
export function SystemDiscovery({ initialRun, autoStart }: { initialRun: DiscoveryRunView | null; autoStart: boolean }) {
  const [run, setRun] = useState<DiscoveryRunView | null>(initialRun?.status === "ready" ? initialRun : null);
  const [systems, setSystems] = useState<RunSystem[]>(initialRun?.systems ?? []);
  const [phase, setPhase] = useState<Phase>(initialRun?.status === "ready" ? "ready" : "idle");
  const [picked, setPicked] = useState<Set<string>>(initialRun?.status === "ready" ? defaultPicks(initialRun) : new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const started = useRef(false);

  const go = async () => {
    setError(null);
    setPhase("reading");
    setRun(null);
    const r = await startDiscoveryAction();
    if (!r.ok) {
      setPhase("error");
      return setError(r.error);
    }
    let list = r.data.systems;
    setSystems(list);
    for (const s of list.filter((x) => x.state === "pending")) {
      const res = await scanSystemAction(r.data.id, s.key);
      const next = res.ok ? res.data : { ...s, state: "failed" as const, line: res.error };
      list = list.map((x) => (x.key === s.key ? next : x));
      setSystems(list);
    }
    setPhase("proposing");
    const p = await proposeAction(r.data.id);
    if (!p.ok) {
      setPhase("error");
      return setError(p.error);
    }
    setRun(p.data);
    setPicked(defaultPicks(p.data));
    setPhase("ready");
  };

  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    const t = setTimeout(() => void go(), 0);
    return () => clearTimeout(t);
    // Runs once on mount; go only uses state setters and server actions.
  }, [autoStart]);

  const toggle = (title: string, on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      if (on) n.add(title);
      else n.delete(title);
      return n;
    });

  const busy = phase === "reading" || phase === "proposing";
  const newProposals = run?.proposals.filter((p) => !p.exists && !run.accepted.includes(p.title)) ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{busy ? "Reading your connected systems" : "What your systems show"}</CardTitle>
          <CardDescription>
            AutonomOS reads a recent sample from each connected system and proposes the recurring work it finds. Personal details are removed first, and nothing changes in your systems.
          </CardDescription>
          {phase === "ready" || phase === "error" || phase === "idle" ? (
            <CardAction>
              <Button size="sm" variant={phase === "idle" ? "default" : "outline"} onClick={() => void go()}>
                {phase === "idle" ? <Sparkles /> : <RefreshCw />}
                {phase === "idle" ? "Read my systems" : "Read again"}
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        {systems.length ? (
          <CardContent>
            <ul className="space-y-2 text-sm" aria-label="Systems read">
              {systems.map((s) => (
                <li key={s.key} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">
                    {s.state === "pending" ? (
                      busy ? (
                        <Spinner className="size-4 text-highlight" />
                      ) : (
                        <CircleDashed className="size-4 text-muted-foreground" />
                      )
                    ) : s.state === "done" ? (
                      <CircleCheck className="size-4 text-success" />
                    ) : s.state === "failed" ? (
                      <CircleAlert className="size-4 text-destructive" />
                    ) : (
                      <CircleDashed className="size-4 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium">{s.name}</span>
                    {s.provider === "sandbox" ? <span className="text-muted-foreground"> · sandbox</span> : null}
                    <span className="block text-xs text-muted-foreground">
                      {s.state === "pending"
                        ? busy
                          ? "Reading…"
                          : "Waiting"
                        : s.state === "done"
                          ? `Read ${s.sampled} ${s.itemKind}${s.periodDays ? ` from the last ${s.periodDays} days` : ""}`
                          : s.line}
                    </span>
                  </span>
                </li>
              ))}
              {phase === "proposing" ? (
                <li className="flex items-center gap-2">
                  <Spinner className="size-4 text-highlight" />
                  <span className="font-medium">Finding the recurring work in what was read…</span>
                </li>
              ) : null}
            </ul>
          </CardContent>
        ) : null}
        {error ? (
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        ) : null}
      </Card>

      {phase === "ready" && run ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {newProposals.length
                ? `${newProposals.length} process${newProposals.length === 1 ? "" : "es"} found`
                : run.proposals.length
                  ? "Everything found is in your inventory"
                  : "Nothing new found"}
            </CardTitle>
            {run.summary ? <CardDescription>{run.summary}</CardDescription> : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {run.proposals.map((p) => {
              const done = p.exists || run.accepted.includes(p.title);
              const hoursPerMonth = ((p.estimatedOccurrencesPerMonth ?? 0) * (p.estimatedMinutesPerOccurrence ?? 0)) / 60;
              return (
                <div key={p.title} className={`rounded-lg border p-3 ${done ? "opacity-60" : ""}`} data-testid="proposal">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`proposal-${p.title}`}
                      checked={!done && picked.has(p.title)}
                      disabled={done}
                      onCheckedChange={(v) => toggle(p.title, v === true)}
                      aria-label={`Add ${p.title}`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <label htmlFor={`proposal-${p.title}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">{p.title}</span>
                        <Badge variant="outline">{p.department}</Badge>
                        {done ? <Badge variant="secondary">Already in your inventory</Badge> : null}
                        {p.confidence < 0.5 ? <Badge variant="warning">Weak evidence</Badge> : null}
                      </label>
                      <p className="text-sm text-muted-foreground">{p.description}</p>
                      <ul className="space-y-0.5 text-xs">
                        {p.evidence.map((e, i) => (
                          <li key={i} className="flex gap-1.5">
                            <span className="shrink-0 font-medium">{e.source}:</span>
                            <span className="text-muted-foreground">{e.detail}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="text-xs text-muted-foreground">
                        {p.estimatedOccurrencesPerMonth ? `About ${Math.round(p.estimatedOccurrencesPerMonth)} a month` : "Volume unknown"}
                        {hoursPerMonth >= 0.5 ? ` · about ${Math.round(hoursPerMonth)} hour${Math.round(hoursPerMonth) === 1 ? "" : "s"} of work a month` : ""}
                      </div>
                      {p.steps.length ? (
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button variant="link" size="sm" className="h-auto px-0 text-xs">
                              {p.steps.length} steps
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
                              {p.steps.map((st, i) => (
                                <li key={i}>{st.title}</li>
                              ))}
                            </ol>
                          </CollapsibleContent>
                        </Collapsible>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {!run.proposals.length ? <p className="text-sm text-muted-foreground">Tell AutonomOS about your work in an interview, or add a process by hand.</p> : null}
          </CardContent>
          <CardFooter className="flex-wrap gap-2">
            {newProposals.length ? (
              <Button
                disabled={saving || !picked.size}
                onClick={() =>
                  startSaving(async () => {
                    const r = await acceptProposalsAction(run.id, [...picked]);
                    if (r && !r.ok) setError(r.error);
                  })
                }
              >
                {saving ? "Adding…" : `Add ${picked.size} to inventory`}
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/discover?tab=interview">Tell us about other work</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/processes/new">Add manually</Link>
            </Button>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  );
}
