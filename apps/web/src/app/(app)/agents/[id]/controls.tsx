"use client";
import { AUTONOMY_LEVELS } from "@autonomos/schemas";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, CardBody, CardHeader, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { changeAutonomyAction, runNowAction, simulateTicketAction, testRunAction, testRunSampleAction } from "../actions";

type Sample = { key: string; label: string };

export function TestPanel({ agentId, ticketDriven, samples }: { agentId: string; ticketDriven: boolean; samples: Sample[] }) {
  const [sample, setSample] = useState(samples[0]?.key ?? "");
  const [json, setJson] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      setError(null);
      let r;
      if (ticketDriven) r = await testRunSampleAction(agentId, sample);
      else {
        let input: Record<string, unknown>;
        try {
          input = JSON.parse(json);
        } catch {
          return setError("Input must be valid JSON");
        }
        r = await testRunAction(agentId, input);
      }
      if (r && !r.ok) setError(r.error);
    });
  return (
    <Card id="test">
      <CardHeader title="Test run" description="Runs the agent end to end. Actions that change things are simulated, never executed." />
      <CardBody className="space-y-3">
        {ticketDriven ? (
          <Field label="Sample ticket">
            <Select value={sample} onChange={(e) => setSample(e.target.value)}>
              {samples.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Input (JSON)">
            <Textarea value={json} onChange={(e) => setJson(e.target.value)} rows={3} className="font-mono text-xs" />
          </Field>
        )}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button onClick={run} disabled={pending}>
          {pending ? "Starting…" : "Run test"}
        </Button>
      </CardBody>
    </Card>
  );
}

export function LivePanel({ agentId, samples, ticketDriven, sandbox }: { agentId: string; samples: Sample[]; ticketDriven: boolean; sandbox: boolean }) {
  const [sample, setSample] = useState(samples[0]?.key ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader
        title={ticketDriven ? "Send a sandbox ticket" : "Run now"}
        description={ticketDriven ? "A customer ticket arrives in the sandbox Zendesk and the live agent picks it up, exactly as a real one would." : "Start a production run now."}
      />
      <CardBody className="space-y-3">
        {ticketDriven ? (
          sandbox ? (
            <Select value={sample} onChange={(e) => setSample(e.target.value)}>
              {samples.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-sm text-muted">Zendesk is connected to a real account; new tickets trigger this agent automatically.</p>
          )
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {!ticketDriven || sandbox ? (
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = ticketDriven ? await simulateTicketAction(sample) : await runNowAction(agentId, {});
                if (r && !r.ok) setError(r.error);
              })
            }
          >
            {pending ? "Starting…" : ticketDriven ? "Send ticket" : "Run now"}
          </Button>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function AutonomyControl({ agentId, level, hasMoney, threshold, canChange }: { agentId: string; level: number; hasMoney: boolean; threshold: number | null; canChange: boolean }) {
  const [next, setNext] = useState(level);
  const [limit, setLimit] = useState<string>(threshold === null ? "" : String(threshold));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!canChange) return <p className="text-sm text-muted">Only admins can change autonomy.</p>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Autonomy level">
          <Select value={next} onChange={(e) => setNext(Number(e.target.value))}>
            {AUTONOMY_LEVELS.filter((l) => l.level > 1).map((l) => (
              <option key={l.level} value={l.level}>
                {l.code} · {l.name}
              </option>
            ))}
          </Select>
        </Field>
        {hasMoney && next >= 4 ? (
          <Field label="Max refund without approval">
            <Input type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </Field>
        ) : null}
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || (next === level && (!hasMoney || limit === String(threshold ?? "")))}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await changeAutonomyAction(agentId, next, hasMoney && next >= 4 && limit !== "" ? Number(limit) : undefined);
            if (!r.ok) return setError(r.error);
            router.refresh();
          })
        }
      >
        {pending ? "Saving…" : "Change autonomy"}
      </Button>
      <p className="text-xs text-muted">Autonomy never changes automatically. Each change creates a new configuration version.</p>
    </div>
  );
}
