"use client";
import { AUTONOMY_LEVELS } from "@autonomos/schemas";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { changeAutonomyAction, runNowAction, simulateTicketAction, testRealAction, testRecordsAction, testRunRecordAction, testRunSampleAction } from "../actions";
import { ButtonLink } from "@/components/app/button-link";
import { relative, systemName } from "@/lib/format";
import { FormField } from "@/components/app/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type Sample = { key: string; label: string };

// Tests run on the workspace's own data only: a record from the connected system, or, for a
// scheduled agent, the last seven days. Systems that are not connected yet come first.
export function TestPanel({
  agentId,
  sandboxTickets,
  samples,
  blockedReason,
  connectFirst = null,
  warnings = [],
  recordSource = null,
  scheduled = false,
  notice = null,
}: {
  agentId: string;
  // A sandbox helpdesk holds no real data: it gets a sample ticket.
  sandboxTickets: boolean;
  samples: Sample[];
  blockedReason?: string | null;
  // Systems still to connect, said as a first step.
  connectFirst?: string | null;
  warnings?: string[];
  recordSource?: string | null;
  scheduled?: boolean;
  // Why the last attempt could not start a test, e.g. from "Build and test".
  notice?: string | null;
}) {
  const [sample, setSample] = useState(samples[0]?.key ?? "");
  const [error, setError] = useState<string | null>(notice);
  const [pending, start] = useTransition();
  const [acknowledged, setAcknowledged] = useState(false);
  const useRecords = !connectFirst && !sandboxTickets && !scheduled && Boolean(recordSource);
  const [records, setRecords] = useState<{ items: Array<{ id: string; kind: string; title: string; date: string | null }>; note?: string } | null>(null);
  const [record, setRecord] = useState("");
  const [loads, setLoads] = useState(0);
  useEffect(() => {
    if (!useRecords) return;
    let live = true;
    testRecordsAction(agentId).then((r) => {
      if (!live) return;
      if (!r.ok) return setRecords({ items: [], note: r.error });
      setRecords({ items: r.data.records, note: r.data.unsupported });
      setRecord(r.data.records[0]?.id ?? "");
    });
    return () => {
      live = false;
    };
  }, [useRecords, agentId, loads]);
  const load = () => {
    setRecords(null);
    setLoads((n) => n + 1);
  };
  const kind = records?.items[0]?.kind ?? "record";
  const preflight = warnings;
  // Running despite a warning is a decision, so it is asked for, not implied by a button label.
  const needsAck = preflight.length > 0;
  const noRecords = useRecords && records !== null && records.items.length === 0;
  const run = () =>
    start(async () => {
      setError(null);
      if (needsAck && !acknowledged) return setError('Tick "Run the test with these warnings" to run it anyway, or fix them first.');
      let r;
      if (sandboxTickets) r = await testRunSampleAction(agentId, sample);
      else if (useRecords) {
        if (!record) return setError(`Pick a ${kind} to test on.`);
        r = await testRunRecordAction(agentId, record);
      } else r = await testRealAction(agentId);
      if (r && !r.ok) setError(r.error);
    });
  return (
    <Card id="test">
      <CardHeader>
        <CardTitle>Test run</CardTitle>
        <CardDescription>Runs on your own data. Changes it would make are simulated.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {connectFirst ? (
          <Alert>
            <AlertDescription>
              <div className="font-medium text-foreground">First, connect your systems</div>
              <p className="mt-1">{connectFirst} Tests always run on your own data, so this comes first.</p>
              <ButtonLink href="/integrations" size="sm" className="mt-3">
                Connect systems
              </ButtonLink>
            </AlertDescription>
          </Alert>
        ) : sandboxTickets ? (
          <FormField label="Sandbox ticket" hint="This helpdesk is a sandbox, so it holds no real tickets. Connect the real one to test on your own.">
            <NativeSelect value={sample} onChange={(e) => setSample(e.target.value)}>
              {samples.map((s) => (
                <NativeSelectOption key={s.key} value={s.key}>
                  {s.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        ) : scheduled ? (
          <p className="text-sm text-muted-foreground">It runs on the last seven days of your data, as a scheduled run would.</p>
        ) : useRecords ? (
          <div>
            <FormField label={`Test on a recent ${kind} from ${systemName(recordSource ?? "")}`}>
              {records === null ? (
                <p className="text-sm text-muted-foreground">Loading your latest {systemName(recordSource ?? "")} records…</p>
              ) : records.items.length ? (
                <NativeSelect value={record} onChange={(e) => setRecord(e.target.value)} aria-label={`Recent ${kind}`}>
                  {records.items.map((r) => (
                    <NativeSelectOption key={r.id} value={r.id}>
                      {`#${r.id} · ${r.title}${r.date ? ` · ${relative(r.date)}` : ""}`}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {records.note ?? `No recent records in ${systemName(recordSource ?? "")} yet.`} Add one there, then load them again.
                </p>
              )}
            </FormField>
            <p className="mt-1 text-xs text-muted-foreground">The agent gets this {kind} exactly as a live run would.</p>
            {noRecords ? (
              <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={load}>
                Load the latest records again
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">It has no tool that reads one of your systems yet, so there is no data to test on. Add a read tool first.</p>
        )}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {preflight.length && !blockedReason && !connectFirst ? (
          <Alert variant="warning">
            <AlertDescription>
              <div className="font-medium">Before you run</div>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {preflight.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <label className="mt-2 flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} aria-label="Run the test with these warnings" />
                Run the test with these warnings
              </label>
            </AlertDescription>
          </Alert>
        ) : null}
        {blockedReason && !connectFirst ? <p className="text-xs text-muted-foreground">{blockedReason}</p> : null}
        {connectFirst ? null : (
          <Button onClick={run} disabled={pending || Boolean(blockedReason) || noRecords || (useRecords && records === null) || (!useRecords && !sandboxTickets && !scheduled)} variant={needsAck ? "outline" : "default"}>
            {pending ? "Starting…" : needsAck ? "Run test anyway" : "Run test"}
          </Button>
        )}
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
        <CardDescription>{ticketDriven ? "The live agent picks it up like a real ticket." : "Start a production run now."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {ticketDriven ? (
          sandbox ? (
            <NativeSelect value={sample} onChange={(e) => setSample(e.target.value)} aria-label="Sample ticket to send">
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
  const [next, setNext] = useState(Math.min(level, 4));
  const [limit, setLimit] = useState<string>(threshold === null ? "" : String(threshold));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!canChange) return <p className="text-sm text-muted-foreground">Only admins can change the mode.</p>;
  return (
    <div className="space-y-3">
      <div className="grid gap-3">
        <FormField label="Mode">
          <NativeSelect value={next} onChange={(e) => setNext(Number(e.target.value))}>
            {AUTONOMY_LEVELS.filter((l) => l.level > 1).map((l) => (
              <NativeSelectOption key={l.level} value={l.level}>
                {l.name}: {l.short.charAt(0).toLowerCase() + l.short.slice(1)}
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
        {pending ? "Saving…" : "Change mode"}
      </Button>
      <p className="text-xs text-muted-foreground">Never changes automatically. Each change is a new version.</p>
    </div>
  );
}
