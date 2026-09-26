"use client";
import { CircleAlert, CircleCheck, CircleDashed, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getDiscoveryRunAction, startDiscoveryAction } from "./actions";
import { ProposalReview } from "./proposal-review";
import type { DiscoveryRunView, RunSystem } from "@/server/system-discovery";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

type Phase = "idle" | "reading" | "proposing" | "ready" | "error";

// Reads every connected system on the server, one at a time so progress is real, then
// proposes processes with the evidence behind each. Starts on its own when there is no
// recent result, and picks up a run already in progress after a reload.
const phaseOf = (run: DiscoveryRunView | null): Phase => (!run ? "idle" : run.status === "ready" ? "ready" : run.status === "failed" ? "error" : run.status === "proposing" ? "proposing" : "reading");

export function SystemDiscovery({ initialRun, autoStart }: { initialRun: DiscoveryRunView | null; autoStart: boolean }) {
  const [run, setRun] = useState<DiscoveryRunView | null>(initialRun?.status === "ready" ? initialRun : null);
  const [systems, setSystems] = useState<RunSystem[]>(initialRun?.systems ?? []);
  const [phase, setPhase] = useState<Phase>(initialRun?.status === "failed" ? "idle" : phaseOf(initialRun));
  const [error, setError] = useState<string | null>(null);
  // The run being followed. Discovery runs on the server; the page only watches it, so
  // closing or reloading the page does not stop it.
  const [watching, setWatching] = useState<string | null>(initialRun && (initialRun.status === "scanning" || initialRun.status === "proposing") ? initialRun.id : null);
  const started = useRef(false);

  const show = (view: DiscoveryRunView) => {
    setSystems(view.systems);
    setPhase(phaseOf(view));
    if (view.status === "ready") setRun(view);
    if (view.status === "failed") setError(view.error ?? "Reading failed. Read again to start over.");
    if (view.status === "ready" || view.status === "failed") setWatching(null);
  };

  const go = async () => {
    setError(null);
    setPhase("reading");
    setRun(null);
    const r = await startDiscoveryAction();
    if (!r.ok) {
      setPhase("error");
      return setError(r.error);
    }
    show(r.data);
    setWatching(r.data.id);
  };

  useEffect(() => {
    if (!watching) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const r = await getDiscoveryRunAction(watching);
      if (stop) return;
      if (r.ok) show(r.data);
      if (!r.ok || r.data.status === "scanning" || r.data.status === "proposing") setTimeout(() => void tick(), 2000);
    };
    const t = setTimeout(() => void tick(), 1500);
    return () => {
      stop = true;
      clearTimeout(t);
    };
    // show only uses state setters.
  }, [watching]);

  useEffect(() => {
    if (!autoStart || started.current || watching) return;
    started.current = true;
    const t = setTimeout(() => void go(), 0);
    return () => clearTimeout(t);
    // Runs once on mount; go only uses state setters and server actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const busy = phase === "reading" || phase === "proposing";
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{busy ? "Reading your connected systems" : "What your systems show"}</CardTitle>
          <CardDescription>
            AutonomOS reads a recent sample from each connected system and proposes the recurring work it finds. Personal details are removed first, and nothing changes in your systems.
            {busy ? " This runs in the background: you can leave this page and come back." : ""}
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
                          ? `Read ${s.estimatedTotal && s.estimatedTotal > (s.sampled ?? 0) ? `${s.sampled} of about ${s.estimatedTotal.toLocaleString("en")}` : s.sampled} ${s.itemKind}${s.periodDays ? ` from the last ${s.periodDays} days` : ""}`
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

      {phase === "ready" && run ? <ProposalReview key={run.id} run={run} onReadAgain={() => void go()} /> : null}
    </div>
  );
}
