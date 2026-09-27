"use client";
import type { DiscoveredProcess } from "@autonomos/schemas";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { AutonomyLadder } from "@/components/domain";
import { hours, pct } from "@/lib/format";
import { answerInterviewAction, finishInterviewAction, startInterviewAction } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type Message = { role: "assistant" | "user"; content: string };

// A person waits on each answer, so it never waits silently: this long, then it stops and offers a retry.
const ANSWER_TIMEOUT_MS = 60_000;
function phase(seconds: number) {
  if (seconds < 3) return "Reading your answer";
  if (seconds < 12) return "Updating the processes";
  if (seconds < 30) return "Writing the next question";
  return "Still working. The AI model is slow right now";
}

export function Interview({ departments, defaultDepartment }: { departments: string[]; defaultDepartment?: string }) {
  const [department, setDepartment] = useState(defaultDepartment && departments.includes(defaultDepartment) ? defaultDepartment : (departments[0] ?? "Customer Support"));
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [processes, setProcesses] = useState<DiscoveredProcess[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<{ since: number; answer: string } | null>(null);
  const [failed, setFailed] = useState<{ answer: string; message: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // Each answer gets an id; a cancelled or superseded answer's result is ignored.
  const request = useRef(0);
  useEffect(() => () => void request.current++, []);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - busy.since) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), [messages]);

  const begin = () =>
    start(async () => {
      setError(null);
      const r = await startInterviewAction(department);
      if (!r.ok) return setError(r.error);
      setSessionId(r.data.id);
      setSuggestions(r.data.suggestions);
      setMessages([{ role: "assistant", content: r.data.opening }]);
      setProcesses([]);
    });

  const submit = async (answer: string) => {
    if (!sessionId) return;
    const id = ++request.current;
    setError(null);
    setFailed(null);
    setElapsed(0);
    setBusy({ since: Date.now(), answer });
    const timeout = new Promise<{ ok: false; error: string }>((resolve) => setTimeout(() => resolve({ ok: false, error: "timeout" }), ANSWER_TIMEOUT_MS));
    const r = await Promise.race([answerInterviewAction(sessionId, answer), timeout]).catch((e: unknown) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : "The answer could not be sent.",
    }));
    if (id !== request.current) return;
    setBusy(null);
    if (!r.ok) {
      setFailed({ answer, message: r.error === "timeout" ? "This took longer than a minute, so it was stopped." : r.error });
      return;
    }
    setMessages(r.data.messages);
    setSuggestions(r.data.suggestions);
    setProcesses(r.data.processes);
    setSelected(new Set(r.data.processes.map((p) => p.title)));
  };

  const send = () => {
    if (!sessionId || !draft.trim() || busy) return;
    const answer = draft.trim();
    setDraft("");
    setSuggestions([]);
    setMessages((m) => [...m, { role: "user", content: answer }]);
    void submit(answer);
  };

  // Stops waiting and puts the answer back in the box to edit or send again.
  const cancel = () => {
    if (!busy) return;
    request.current++;
    setMessages((m) => (m.at(-1)?.role === "user" ? m.slice(0, -1) : m));
    setDraft(busy.answer);
    setBusy(null);
  };

  const save = () =>
    start(async () => {
      if (!sessionId) return;
      const r = await finishInterviewAction(sessionId, [...selected]);
      if (!r.ok) return setError(r.error);
      router.push("/processes?status=draft");
    });

  if (!sessionId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Guided interview</CardTitle>
          <CardDescription>Answer a few questions about how a team works. AutonomOS turns the answers into structured processes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div>
            <div className="mb-1 text-sm font-medium">Start with</div>
            <NativeSelect value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department" className="sm:w-56">
              {departments.map((d) => (
                <NativeSelectOption key={d}>{d}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Button onClick={begin} disabled={pending}>
            Start interview
          </Button>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="flex flex-col lg:col-span-2">
        <CardHeader>
          <CardTitle>{`${department} interview`}</CardTitle>
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => setSessionId(null)}>
              Restart
            </Button>
          </CardAction>
        </CardHeader>
        <div className="max-h-[50vh] flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5 lg:max-h-[28rem]">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-6 rounded-lg bg-primary/10 px-3 py-2 text-sm sm:ml-8" : "mr-6 rounded-lg bg-muted px-3 py-2 text-sm sm:mr-8"}>
              {m.content}
            </div>
          ))}
          {busy ? (
            <div className="mr-6 flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground sm:mr-8" role="status">
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                {phase(elapsed)}… <span className="tabular-nums">{elapsed}s</span>
              </span>
              <Button variant="ghost" size="sm" className="h-7" onClick={cancel}>
                Cancel
              </Button>
            </div>
          ) : null}
          {failed ? (
            <Alert variant="warning" className="mr-6 sm:mr-8">
              <AlertDescription>
                <p>{failed.message}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void submit(failed.answer)}>
                    Retry
                  </Button>
                  {processes.length ? (
                    <Button size="sm" variant="outline" onClick={save}>
                      Save what was found
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" asChild>
                    <Link href="/processes/new">Add a process by hand</Link>
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
          <div ref={end} />
        </div>
        <div className="border-t border-border p-3">
          {suggestions.length && !busy ? (
            <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Suggested answers">
              {suggestions.map((sug) => (
                <Button key={sug} type="button" variant="outline" size="sm" className="h-auto max-w-full whitespace-normal py-1 text-left text-xs" onClick={() => setDraft(sug)}>
                  <Sparkles className="text-primary" />
                  {sug}
                </Button>
              ))}
            </div>
          ) : null}
          <Textarea
            aria-label="Your answer"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={3}
            placeholder="Answer tickets, approve refunds, investigate account problems, review flagged listings…"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Enter to send. Say &quot;done&quot; when you have covered the main work.</span>
            <Button size="sm" onClick={send} disabled={Boolean(busy) || !draft.trim()}>
              Send
            </Button>
          </div>
          {error ? (
            <Alert variant="destructive" className="mt-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </Card>
      <div className="space-y-3 lg:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Processes found ({processes.length})</h2>
          <Button size="sm" onClick={save} disabled={pending || Boolean(busy) || selected.size === 0}>
            Save {selected.size} to inventory
          </Button>
        </div>
        {processes.length === 0 ? <p className="text-sm text-muted-foreground">Processes appear here as you answer.</p> : null}
        {processes.map((p) => {
          const monthly = (p.estimatedOccurrencesPerMonth ?? 0) * (p.estimatedMinutesPerOccurrence ?? 0);
          return (
            <FieldLabel key={p.title} htmlFor={`found-${p.title}`} className="bg-card">
              <Field orientation="horizontal" className="items-start">
                <Checkbox
                  id={`found-${p.title}`}
                  className="mt-0.5"
                  checked={selected.has(p.title)}
                  onCheckedChange={(v) => {
                    const next = new Set(selected);
                    if (v === true) next.add(p.title);
                    else next.delete(p.title);
                    setSelected(next);
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{p.title}</span>
                    <AutonomyLadder current={p.currentAutonomyLevel} target={p.potentialAutonomyLevel} size="sm" />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <Badge variant="secondary">{p.steps.length} steps</Badge>
                    {monthly ? <Badge variant="secondary">{hours(monthly)} / month</Badge> : null}
                    {p.systems.map((s) => (
                      <Badge key={s} variant="info">
                        {s}
                      </Badge>
                    ))}
                    <Badge variant={p.confidence < 0.6 ? "warning" : "secondary"}>confidence {pct(p.confidence)}</Badge>
                  </div>
                  {p.missingInformation.length ? <p className="mt-2 text-xs text-warning">Still missing: {p.missingInformation.join("; ")}</p> : null}
                </div>
              </Field>
            </FieldLabel>
          );
        })}
      </div>
    </div>
  );
}
