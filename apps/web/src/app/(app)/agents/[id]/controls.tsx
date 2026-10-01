"use client";
import { AUTONOMY_LEVELS } from "@autonomos/schemas";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { changeAutonomyAction, runNowAction, simulateTicketAction, testRecordsAction, testRunAction, testRunRecordAction, testRunSampleAction } from "../actions";
import { relative, systemName } from "@/lib/format";
import { FormField } from "@/components/app/form-field";
import { checkTestInput } from "@/lib/test-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type Sample = { key: string; label: string };

export function TestPanel({
  agentId,
  ticketDriven,
  samples,
  blockedReason,
  warnings = [],
  sampleInput = "{}",
  recordSource = null,
}: {
  agentId: string;
  ticketDriven: boolean;
  samples: Sample[];
  blockedReason?: string | null;
  warnings?: string[];
  sampleInput?: string;
  // The connected system a test can take a real record from, if any.
  recordSource?: string | null;
}) {
  const [sample, setSample] = useState(samples[0]?.key ?? "");
  const [json, setJson] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [acknowledged, setAcknowledged] = useState(false);
  const [mode, setMode] = useState<"record" | "json">(recordSource && !ticketDriven ? "record" : "json");
  const [records, setRecords] = useState<{ items: Array<{ id: string; kind: string; title: string; date: string | null }>; note?: string } | null>(null);
  const [record, setRecord] = useState("");
  useEffect(() => {
    if (mode !== "record" || records) return;
    testRecordsAction(agentId).then((r) => {
      if (!r.ok) return setRecords({ items: [], note: r.error });
      setRecords({ items: r.data.records, note: r.data.unsupported });
      setRecord(r.data.records[0]?.id ?? "");
    });
  }, [mode, records, agentId]);
  const useRecord = mode === "record" && !ticketDriven;
  const check = ticketDriven || useRecord ? null : checkTestInput(json);
  const errors = check?.errors ?? [];
  const preflight = useRecord ? warnings.filter((w) => !/empty input/.test(w)) : [...warnings, ...(check?.warnings ?? [])];
  const kind = records?.items[0]?.kind ?? "record";
  // Running despite a warning is a decision, so it is asked for, not implied by a button label.
  const needsAck = preflight.length > 0;
  const run = () =>
    start(async () => {
      setError(null);
      // The button stays usable; running past a warning still needs the box ticked.
      if (needsAck && !acknowledged) return setError('Tick "Run the test with these warnings" to run it anyway, or fix them first.');
      let r;
      if (ticketDriven) r = await testRunSampleAction(agentId, sample);
      else if (useRecord) {
        if (!record) return setError(`Pick a ${kind} to test on.`);
        r = await testRunRecordAction(agentId, record);
      } else {
        if (!check?.value) return setError(errors.join(" "));
        r = await testRunAction(agentId, check.value, acknowledged);
      }
      if (r && !r.ok) setError(r.error);
    });
  return (
    <Card id="test">
      <CardHeader>
        <CardTitle>Test run</CardTitle>
        <CardDescription>Actions that change things are simulated.</CardDescription>
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
        ) : useRecord ? (
          <div>
            <FormField label={`Test on a recent ${kind} from ${systemName(recordSource ?? "")}`}>
              {records === null ? (
                <p className="text-sm text-muted-foreground">Loading the latest {systemName(recordSource ?? "")} records…</p>
              ) : records.items.length ? (
                <NativeSelect value={record} onChange={(e) => setRecord(e.target.value)} aria-label={`Recent ${kind}`}>
                  {records.items.map((r) => (
                    <NativeSelectOption key={r.id} value={r.id}>
                      {`#${r.id} · ${r.title}${r.date ? ` · ${relative(r.date)}` : ""}`}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : (
                <p className="text-sm text-muted-foreground">{records.note ?? "No recent records came back."} You can write the input yourself.</p>
              )}
            </FormField>
            <p className="mt-1 text-xs text-muted-foreground">The agent gets this {kind} exactly as a live run would. Changes it would make are simulated.</p>
            <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => setMode("json")}>
              Write the input yourself
            </Button>
          </div>
        ) : (
          <div>
            {recordSource ? (
              <Button type="button" variant="link" size="sm" className="mb-1 h-auto px-0 text-xs" onClick={() => setMode("record")}>
                Test on a recent record from {systemName(recordSource)} instead
              </Button>
            ) : null}
            <FormField label="Input (JSON)">
              <Textarea
                value={json}
                onChange={(e) => {
                  setJson(e.target.value);
                  setAcknowledged(false);
                }}
                aria-invalid={errors.length > 0}
                aria-describedby={errors.length ? "test-input-error" : undefined}
                rows={json.split("\n").length > 3 ? 6 : 3}
                className="font-mono text-xs"
              />
            </FormField>
            {errors.length ? (
              <p id="test-input-error" className="mt-1 text-xs text-destructive">
                {errors.join(" ")}
              </p>
            ) : null}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs"
              onClick={() => {
                setJson(sampleInput);
                setAcknowledged(false);
              }}
            >
              Use sample input
            </Button>
          </div>
        )}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {preflight.length && !blockedReason ? (
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
        {blockedReason ? <p className="text-xs text-muted-foreground">{blockedReason}</p> : null}
        <Button onClick={run} disabled={pending || Boolean(blockedReason) || errors.length > 0} variant={needsAck ? "outline" : "default"}>
          {pending ? "Starting…" : needsAck ? "Run test anyway" : "Run test"}
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
