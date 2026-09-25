"use client";
import type { DiscoveredProcess } from "@autonomos/schemas";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AutonomyLadder } from "@/components/domain";
import { Badge, Button, Card, CardBody, CardHeader, Notice, Select, Textarea } from "@/components/ui";
import { hours, pct } from "@/lib/format";
import { answerInterviewAction, finishInterviewAction, startInterviewAction } from "./actions";

type Message = { role: "assistant" | "user"; content: string };

export function Interview({ departments }: { departments: string[] }) {
  const [department, setDepartment] = useState(departments[0] ?? "Customer Support");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [processes, setProcesses] = useState<DiscoveredProcess[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), [messages]);

  const begin = () =>
    start(async () => {
      setError(null);
      const r = await startInterviewAction(department);
      if (!r.ok) return setError(r.error);
      setSessionId(r.data);
      setMessages([{ role: "assistant", content: `Let's start with ${department}. What are the main things your team repeatedly does each week?` }]);
      setProcesses([]);
    });

  const send = () => {
    if (!sessionId || !draft.trim()) return;
    const answer = draft.trim();
    setDraft("");
    setMessages((m) => [...m, { role: "user", content: answer }]);
    start(async () => {
      const r = await answerInterviewAction(sessionId, answer);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMessages(r.data.messages);
      setProcesses(r.data.processes);
      setSelected(new Set(r.data.processes.map((p) => p.title)));
    });
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
        <CardHeader title="Guided interview" description="Answer a few questions about how a team works. AutonomOS turns the answers into structured processes." />
        <CardBody className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-sm font-medium">Start with</div>
            <Select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-56">
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Select>
          </div>
          <Button onClick={begin} disabled={pending}>
            Start interview
          </Button>
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="flex flex-col lg:col-span-2">
        <CardHeader title={`${department} interview`} action={<button className="text-xs text-muted hover:text-foreground" onClick={() => setSessionId(null)}>Restart</button>} />
        <div className="max-h-[28rem] flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-8 rounded-lg bg-accent-soft px-3 py-2 text-sm" : "mr-8 rounded-lg bg-surface-muted px-3 py-2 text-sm"}>
              {m.content}
            </div>
          ))}
          {pending ? <div className="mr-8 text-sm text-muted">Structuring…</div> : null}
          <div ref={end} />
        </div>
        <div className="border-t border-border p-3">
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
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted">Enter to send. Say &quot;done&quot; when you have covered the main work.</span>
            <Button size="sm" onClick={send} disabled={pending || !draft.trim()}>
              Send
            </Button>
          </div>
          {error ? <Notice tone="danger" className="mt-2">{error}</Notice> : null}
        </div>
      </Card>
      <div className="space-y-3 lg:col-span-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Processes found ({processes.length})</h2>
          <Button size="sm" onClick={save} disabled={pending || selected.size === 0}>
            Save {selected.size} to inventory
          </Button>
        </div>
        {processes.length === 0 ? <p className="text-sm text-muted">Processes appear here as you answer.</p> : null}
        {processes.map((p) => {
          const monthly = (p.estimatedOccurrencesPerMonth ?? 0) * (p.estimatedMinutesPerOccurrence ?? 0);
          return (
            <Card key={p.title} className="p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(p.title)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(p.title);
                    else next.delete(p.title);
                    setSelected(next);
                  }}
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{p.title}</span>
                    <AutonomyLadder current={p.currentAutonomyLevel} target={p.potentialAutonomyLevel} size="sm" />
                  </div>
                  <p className="mt-1 text-sm text-muted">{p.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <Badge>{p.steps.length} steps</Badge>
                    {monthly ? <Badge>{hours(monthly)} / month</Badge> : null}
                    {p.systems.map((s) => (
                      <Badge key={s} tone="info">
                        {s}
                      </Badge>
                    ))}
                    <Badge tone={p.confidence < 0.6 ? "warn" : "neutral"}>confidence {pct(p.confidence)}</Badge>
                  </div>
                  {p.missingInformation.length ? <p className="mt-2 text-xs text-warn">Still missing: {p.missingInformation.join("; ")}</p> : null}
                </div>
              </label>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
