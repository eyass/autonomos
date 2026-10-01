"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, Hand } from "lucide-react";
import Link from "next/link";
import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { pct } from "@/lib/format";
import { approveAction, modifyAction, rejectAction } from "./actions";

export type ApprovalView = {
  id: string;
  title: string;
  agentName: string;
  agentId: string;
  runId: string;
  reason: string | null;
  description: string | null;
  confidence: number | null;
  risk: number | null;
  proposed: Record<string, unknown>;
  modifiableFields: string[];
  evidence: Array<{ source: string; description: string }>;
  checks: Array<{ rule: string; passed: boolean; detail?: string; effect?: string }>;
  requestedAt: string;
  expiresAt: string;
};

export function ApprovalCard({ a, canApprove }: { a: ApprovalView; canApprove: boolean }) {
  const [mode, setMode] = useState<"idle" | "modify" | "reject">("idle");
  const [changes, setChanges] = useState<Record<string, string>>(Object.fromEntries(a.modifiableFields.map((f) => [f, String(a.proposed[f] ?? "")])));
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Failed");
      router.refresh();
    });
  const typed = () =>
    Object.fromEntries(
      Object.entries(changes)
        .filter(([k, v]) => String(a.proposed[k] ?? "") !== v)
        .map(([k, v]) => [k, typeof a.proposed[k] === "number" ? Number(v) : v]),
    );
  const approvalReasons = a.checks.filter((c) => c.effect === "require_approval");

  return (
    <Card data-testid="approval-card" className="relative overflow-hidden">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-highlight" />
      <CardHeader>
        <div className="flex items-start gap-3">
          <span aria-hidden className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-highlight-soft text-highlight-strong sm:flex">
            <Hand className="size-[18px]" />
          </span>
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base sm:text-lg">{a.title}</CardTitle>
            <CardDescription>
              Agent:{" "}
              <Link className="hover:underline" href={`/agents/${a.agentId}`}>
                {a.agentName}
              </Link>
            </CardDescription>
          </div>
        </div>
        <CardAction className="flex flex-col items-end gap-1.5 sm:flex-row sm:flex-wrap sm:justify-end">
          {a.confidence !== null ? <Badge variant={a.confidence >= 0.9 ? "success" : "warning"}>Confidence {pct(a.confidence)}</Badge> : null}
          {a.risk ? <Badge variant={a.risk >= 4 ? "danger" : "secondary"}>Risk {a.risk}/5</Badge> : null}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {a.reason ? (
          <div>
            <div className="eyebrow text-[11px] text-muted-foreground">Why the agent wants to do this</div>
            <p className="mt-1">{a.reason}</p>
          </div>
        ) : null}
        {a.evidence.length ? (
          <div>
            <div className="eyebrow text-[11px] text-muted-foreground">Based on</div>
            <ul className="mt-1.5 space-y-1 rounded-lg border border-border bg-muted/40 p-2.5">
              {a.evidence.slice(0, 3).map((e, i) => (
                <li key={i}>
                  <Badge variant="secondary">{e.source}</Badge> {e.description}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {approvalReasons.length ? <p className="text-xs text-muted-foreground">Needs approval because: {approvalReasons.map((c) => c.detail ?? c.rule).join("; ")}</p> : null}
        {mode === "modify" ? (
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            {a.modifiableFields.map((f) => (
              <FormField key={f} label={f.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase())}>
                {typeof a.proposed[f] === "string" && String(a.proposed[f]).length > 60 ? (
                  <Textarea value={changes[f]} onChange={(e) => setChanges({ ...changes, [f]: e.target.value })} rows={4} />
                ) : (
                  <Input type={typeof a.proposed[f] === "number" ? "number" : "text"} value={changes[f]} onChange={(e) => setChanges({ ...changes, [f]: e.target.value })} />
                )}
              </FormField>
            ))}
          </FieldGroup>
        ) : null}
        {mode !== "idle" ? <Textarea rows={2} placeholder="Comment for the audit log (optional)" aria-label="Comment" value={comment} onChange={(e) => setComment(e.target.value)} /> : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="link" size="sm" className="group h-auto px-0 text-xs">
              Evidence, policy and tool data
              <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Evidence</div>
              <ul className="space-y-1">
                {a.evidence.map((e, i) => (
                  <li key={i}>
                    <Badge variant="secondary">{e.source}</Badge> {e.description}
                  </li>
                ))}
                {!a.evidence.length ? <li className="text-muted-foreground">None provided</li> : null}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Policy checks</div>
              <ul className="space-y-0.5 text-xs">
                {a.checks.map((c, i) => (
                  <li key={i} className={c.passed ? "text-success" : c.effect === "deny" ? "text-destructive" : "text-warning"}>
                    {c.passed ? "✓" : "•"} {c.rule}
                    {c.detail ? <span className="text-muted-foreground"> ({c.detail})</span> : null}
                  </li>
                ))}
              </ul>
              <div className="mb-1 mt-3 text-xs font-medium text-muted-foreground">Proposed action</div>
              <pre className="max-w-full overflow-x-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(a.proposed, null, 2)}</pre>
              <Link href={`/activity/${a.runId}`} className="mt-2 inline-block text-xs text-primary hover:underline">
                Full run history and tool data
              </Link>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
      <CardFooter className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {!canApprove ? (
          <p className="col-span-2 text-xs text-muted-foreground">You do not have approval permission.</p>
        ) : mode === "idle" ? (
          <>
            <Button className="col-span-2" disabled={pending} onClick={() => act(() => approveAction(a.id))}>
              {pending ? <Spinner /> : null}
              Approve
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setMode("reject")}>
              Reject
            </Button>
            {a.modifiableFields.length ? (
              <Button variant="outline" disabled={pending} onClick={() => setMode("modify")}>
                Modify
              </Button>
            ) : null}
          </>
        ) : mode === "modify" ? (
          <>
            <Button disabled={pending || Object.keys(typed()).length === 0} onClick={() => act(() => modifyAction(a.id, typed(), comment || undefined))}>
              Approve with changes
            </Button>
            <Button variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button variant="destructive" disabled={pending} onClick={() => act(() => rejectAction(a.id, comment || undefined))}>
              Reject
            </Button>
            <Button variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
