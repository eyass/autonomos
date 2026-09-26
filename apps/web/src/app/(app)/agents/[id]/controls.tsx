"use client";
import { AUTONOMY_LEVELS } from "@autonomos/schemas";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeAutonomyAction, runNowAction, simulateTicketAction, testRunAction, testRunSampleAction } from "../actions";
import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type Sample = { key: string; label: string };

export function TestPanel({ agentId, ticketDriven, samples, blockedReason }: { agentId: string; ticketDriven: boolean; samples: Sample[]; blockedReason?: string | null }) {
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
      <CardHeader>
        <CardTitle>Test run</CardTitle>
        <CardDescription>Runs the agent end to end. Actions that change things are simulated, never executed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {ticketDriven ? (
          <FormField label="Sample ticket">
            <NativeSelect value={sample} onChange={(e) => setSample(e.target.value)}>
              {samples.map((s) => (
                <NativeSelectOption key={s.key} value={s.key}>
                  {s.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        ) : (
          <FormField label="Input (JSON)">
            <Textarea value={json} onChange={(e) => setJson(e.target.value)} rows={3} className="font-mono text-xs" />
          </FormField>
        )}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {blockedReason ? <p className="text-xs text-muted-foreground">{blockedReason}</p> : null}
        <Button onClick={run} disabled={pending || Boolean(blockedReason)}>
          {pending ? "Starting…" : "Run test"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function LivePanel({ agentId, samples, ticketDriven, sandbox }: { agentId: string; samples: Sample[]; ticketDriven: boolean; sandbox: boolean }) {
  const [sample, setSample] = useState(samples[0]?.key ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ticketDriven ? "Send a sandbox ticket" : "Run now"}</CardTitle>
        <CardDescription>
          {ticketDriven ? "A customer ticket arrives in the sandbox Zendesk and the live agent picks it up, exactly as a real one would." : "Start a production run now."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {ticketDriven ? (
          sandbox ? (
            <NativeSelect value={sample} onChange={(e) => setSample(e.target.value)}>
              {samples.map((s) => (
                <NativeSelectOption key={s.key} value={s.key}>
                  {s.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : (
            <p className="text-sm text-muted-foreground">Zendesk is connected to a real account; new tickets trigger this agent automatically.</p>
          )
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
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
      </CardContent>
    </Card>
  );
}

export function AutonomyControl({ agentId, level, hasMoney, threshold, canChange }: { agentId: string; level: number; hasMoney: boolean; threshold: number | null; canChange: boolean }) {
  const [next, setNext] = useState(level);
  const [limit, setLimit] = useState<string>(threshold === null ? "" : String(threshold));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!canChange) return <p className="text-sm text-muted-foreground">Only admins can change autonomy.</p>;
  return (
    <div className="space-y-3">
      <div className="grid gap-3">
        <FormField label="Autonomy level">
          <NativeSelect value={next} onChange={(e) => setNext(Number(e.target.value))}>
            {AUTONOMY_LEVELS.filter((l) => l.level > 1).map((l) => (
              <NativeSelectOption key={l.level} value={l.level}>
                {l.code} · {l.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        {hasMoney && next >= 4 ? (
          <FormField label="Max refund without approval">
            <Input type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </FormField>
        ) : null}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        size="sm"
        variant="outline"
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
      <p className="text-xs text-muted-foreground">Autonomy never changes automatically. Each change creates a new configuration version.</p>
    </div>
  );
}
