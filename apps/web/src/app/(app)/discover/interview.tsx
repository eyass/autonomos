"use client";
import type { DiscoveredProcess } from "@autonomos/schemas";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AutonomyLadder } from "@/components/domain";
import { hours, pct } from "@/lib/format";
import type { InterviewState } from "@/server/processes";
import { answerInterviewAction, cancelInterviewAction, finishInterviewAction, retryInterviewAction, startInterviewAction } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type Message = { role: "assistant" | "user"; content: string };
export type ResumableInterview = { id: string; department: string; answers: number };

// Each answer is worked on by the server after the request returns; the page asks how it is
// going this often, and gives up asking (with a way to try again) after this many misses.
const POLL_MS = 1_500;
const MAX_MISSES = 5;
// The interview open in this tab, so switching tabs and coming back carries on where it was.
const STORAGE_KEY = "autonomos:interview";

function phase(seconds: number) {
  if (seconds < 3) return "Reading your answer";
  if (seconds < 12) return "Updating the processes";
  if (seconds < 30) return "Writing the next question";
  return "Still working. The AI model is slow right now";
}

function remember(id: string | null) {
  try {
    if (id) window.sessionStorage.setItem(STORAGE_KEY, id);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked; resuming then relies on the Continue button.
  }
}

function remembered() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function fetchInterview(id: string, signal?: AbortSignal): Promise<InterviewState | "gone" | null> {
  try {
    const res = await fetch(`/api/interviews/${id}`, { signal, cache: "no-store" });
    if (res.status === 404) return "gone";
    const json = (await res.json()) as { ok: boolean; data?: InterviewState };
    return json.ok && json.data ? json.data : null;
  } catch {
    return null;
  }
}

// Wall-clock reads live here, outside render.
const nowMs = () => Date.now();

export function Interview({ departments, defaultDepartment, resumable }: { departments: string[]; defaultDepartment?: string; resumable?: ResumableInterview | null }) {
  const [department, setDepartment] = useState(defaultDepartment && departments.includes(defaultDepartment) ? defaultDepartment : (departments[0] ?? "Customer Support"));
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [processes, setProcesses] = useState<DiscoveredProcess[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // The answer being worked on, with the server's elapsed seconds and when they were read.
  const [busy, setBusy] = useState<{ answer: string; base: number; at: number } | null>(null);
  const [failed, setFailed] = useState<{ answer: string; message: string; lost?: boolean } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [resuming, setResuming] = useState(false);
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  const known = useRef<Set<string>>(new Set());
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // Takes the server's view of the interview as the truth.
  const apply = useCallback((s: InterviewState) => {
    setSessionId(s.id);
    setDepartment(s.department);
    setMessages(s.messages);
    setProcesses(s.processes);
    setSuggestions(s.suggestions);
    // New processes start selected; ones the person unticked stay unticked.
    setSelected((prev) => {
      const next = new Set([...prev].filter((t) => s.processes.some((p) => p.title === t)));
      for (const p of s.processes) if (!known.current.has(p.title)) next.add(p.title);
      known.current = new Set(s.processes.map((p) => p.title));
      return next;
    });
    setBusy(s.pending ? { answer: s.pending.answer, base: s.pending.elapsed, at: nowMs() } : null);
    setElapsed(s.pending?.elapsed ?? 0);
    setFailed(s.failed);
  }, []);

  // Shows a fetched interview, or forgets it when it is gone or already saved.
  const opened = useCallback(
    (s: InterviewState | "gone" | null) => {
      setResuming(false);
      if (s === "gone" || (s && s.status !== "open")) return remember(null);
      if (!s) return setError("Could not load the interview. Try again in a moment.");
      remember(s.id);
      apply(s);
    },
    [apply],
  );

  // Picks the interview back up after a reload.
  useEffect(() => {
    const id = remembered();
    if (!id) return;
    const controller = new AbortController();
    fetchInterview(id, controller.signal).then((s) => {
      if (!controller.signal.aborted) opened(s);
    });
    return () => controller.abort();
  }, [opened]);

  // While an answer is worked on: follow it on the server, and count the seconds between reads.
  const polling = busy !== null;
  useEffect(() => {
    if (!polling || !sessionId) return;
    const controller = new AbortController();
    let misses = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const s = await fetchInterview(sessionId, controller.signal);
      if (controller.signal.aborted) return;
      if (s && s !== "gone") {
        misses = 0;
        apply(s);
        if (s.pending) timer = setTimeout(poll, POLL_MS);
        return;
      }
      if (s === "gone" || ++misses >= MAX_MISSES) {
        const b = busyRef.current;
        setBusy(null);
        if (b) setFailed({ answer: b.answer, message: "Lost contact with the server while it worked on your answer.", lost: true });
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    const tick = setInterval(() => {
      const b = busyRef.current;
      if (b) setElapsed(b.base + Math.round((nowMs() - b.at) / 1000));
    }, 1000);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [polling, sessionId, apply]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  const begin = () =>
    start(async () => {
      setError(null);
      const r = await startInterviewAction(department);
      if (!r.ok) return setError(r.error);
      remember(r.data.id);
      known.current = new Set();
      apply({ id: r.data.id, department, status: "open", messages: [{ role: "assistant", content: r.data.opening }], processes: [], suggestions: r.data.suggestions, pending: null, failed: null });
    });

  const send = () => {
    if (!sessionId || !draft.trim() || busy || pending) return;
    const answer = draft.trim();
    setDraft("");
    setError(null);
    setFailed(null);
    setSuggestions([]);
    setMessages((m) => [...m, { role: "user", content: answer }]);
    setBusy({ answer, base: 0, at: nowMs() });
    setElapsed(0);
    start(async () => {
      const r = await answerInterviewAction(sessionId, answer).catch(() => ({ ok: false as const, error: "The answer could not be sent. Check your connection." }));
      if (r.ok) return apply(r.data);
      setBusy(null);
      setMessages((m) => (m.at(-1)?.role === "user" && m.at(-1)?.content === answer ? m.slice(0, -1) : m));
      setDraft(answer);
      setError(r.error);
    });
  };

  const retry = () => {
    if (!sessionId || !failed) return;
    const lost = failed.lost;
    setFailed(null);
    setError(null);
    start(async () => {
      // After a lost connection the turn may well have finished; look before running it again.
      if (lost) {
        const s = await fetchInterview(sessionId);
        if (s && s !== "gone" && !s.failed) return apply(s);
      }
      const r = await retryInterviewAction(sessionId).catch(() => ({ ok: false as const, error: "Could not reach the server. Try again." }));
      if (r.ok) return apply(r.data);
      setFailed({ answer: failed.answer, message: r.error, lost });
    });
  };

  // Takes the answer back and puts it in the box to edit or send again.
  const cancel = () => {
    if (!sessionId || !(busy || failed)) return;
    const answer = busy?.answer ?? failed?.answer ?? "";
    start(async () => {
      const r = await cancelInterviewAction(sessionId).catch(() => null);
      if (r?.ok) apply(r.data.state);
      else {
        setBusy(null);
        setFailed(null);
        setMessages((m) => (m.at(-1)?.role === "user" ? m.slice(0, -1) : m));
      }
      setDraft(answer);
    });
  };

  const restart = () => {
    remember(null);
    setSessionId(null);
    setBusy(null);
    setFailed(null);
    setMessages([]);
    setProcesses([]);
    setSuggestions([]);
    known.current = new Set();
  };

  const save = () =>
    start(async () => {
      if (!sessionId) return;
      const r = await finishInterviewAction(sessionId, [...selected]);
      if (!r.ok) return setError(r.error);
      remember(null);
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
          <Button onClick={begin} disabled={pending || resuming}>
            {pending ? "Starting…" : "Start interview"}
          </Button>
          {resumable ? (
            <Button
              variant="outline"
              onClick={() => {
                setResuming(true);
                void fetchInterview(resumable.id).then(opened);
              }}
              disabled={pending || resuming}
            >
              {resuming ? "Opening…" : `Continue the ${resumable.department} interview (${resumable.answers} answer${resumable.answers === 1 ? "" : "s"})`}
            </Button>
          ) : null}
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
    <div className="grid gap-6 xl:grid-cols-5">
      <Card className="flex min-w-0 flex-col xl:col-span-2">
        <CardHeader>
          <CardTitle>{`${department} interview`}</CardTitle>
          <CardAction>
            <Button variant="ghost" size="sm" onClick={restart} disabled={pending}>
              Restart
            </Button>
          </CardAction>
        </CardHeader>
        <div className="max-h-[50vh] flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5 xl:max-h-[28rem]">
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
              <Button variant="ghost" size="sm" className="h-7" onClick={cancel} disabled={pending}>
                Cancel
              </Button>
            </div>
          ) : null}
          {failed ? (
            <Alert variant="warning" className="mr-6 sm:mr-8">
              <AlertDescription>
                <p>{failed.message}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={retry} disabled={pending}>
                    Retry
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancel} disabled={pending}>
                    Edit answer
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
      <div className="min-w-0 space-y-3 xl:col-span-3">
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
