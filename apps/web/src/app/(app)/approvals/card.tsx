"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Button, Card, Input, Notice, Textarea } from "@/components/ui";
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
  const [open, setOpen] = useState(false);
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
    <Card className="p-5" data-testid="approval-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{a.title}</div>
          <div className="mt-0.5 text-sm text-muted">
            Agent: <a className="hover:underline" href={`/agents/${a.agentId}`}>{a.agentName}</a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {a.confidence !== null ? <Badge tone={a.confidence >= 0.9 ? "ok" : "warn"}>Confidence {pct(a.confidence)}</Badge> : null}
          {a.risk ? <Badge tone={a.risk >= 4 ? "danger" : "neutral"}>Risk {a.risk}/5</Badge> : null}
        </div>
      </div>
      {a.reason ? (
        <p className="mt-3 text-sm">
          <span className="font-medium">Reason: </span>
          {a.reason}
        </p>
      ) : null}
      {approvalReasons.length ? (
        <p className="mt-2 text-xs text-muted">Needs approval because: {approvalReasons.map((c) => c.detail ?? c.rule).join("; ")}</p>
      ) : null}

      {mode === "modify" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {a.modifiableFields.map((f) => (
            <label key={f} className="text-sm">
              <span className="mb-1 block font-medium capitalize">{f.replaceAll("_", " ")}</span>
              {typeof a.proposed[f] === "string" && String(a.proposed[f]).length > 60 ? (
                <Textarea value={changes[f]} onChange={(e) => setChanges({ ...changes, [f]: e.target.value })} rows={4} />
              ) : (
                <Input type={typeof a.proposed[f] === "number" ? "number" : "text"} value={changes[f]} onChange={(e) => setChanges({ ...changes, [f]: e.target.value })} />
              )}
            </label>
          ))}
        </div>
      ) : null}
      {mode !== "idle" ? <Textarea className="mt-3" rows={2} placeholder="Comment for the audit log (optional)" value={comment} onChange={(e) => setComment(e.target.value)} /> : null}
      {error ? <Notice tone="danger" className="mt-3">{error}</Notice> : null}

      {canApprove ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {mode === "idle" ? (
            <>
              <Button disabled={pending} onClick={() => act(() => approveAction(a.id))}>
                Approve
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => setMode("reject")}>
                Reject
              </Button>
              {a.modifiableFields.length ? (
                <Button variant="secondary" disabled={pending} onClick={() => setMode("modify")}>
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
              <Button variant="danger" disabled={pending} onClick={() => act(() => rejectAction(a.id, comment || undefined))}>
                Reject
              </Button>
              <Button variant="ghost" onClick={() => setMode("idle")}>
                Cancel
              </Button>
            </>
          )}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted">You do not have approval permission.</p>
      )}

      <button type="button" className="mt-4 text-xs font-medium text-accent hover:underline" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide details" : "Evidence, policy and tool data"}
      </button>
      {open ? (
        <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium text-muted">Evidence</div>
            <ul className="space-y-1">
              {a.evidence.map((e, i) => (
                <li key={i}>
                  <Badge>{e.source}</Badge> {e.description}
                </li>
              ))}
              {!a.evidence.length ? <li className="text-muted">None provided</li> : null}
            </ul>
            <div className="mb-1 mt-3 text-xs font-medium text-muted">Agent reasoning</div>
            <p className="text-muted">{a.reason ?? "–"}</p>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted">Policy checks</div>
            <ul className="space-y-0.5 text-xs">
              {a.checks.map((c, i) => (
                <li key={i} className={c.passed ? "text-ok" : c.effect === "deny" ? "text-danger" : "text-warn"}>
                  {c.passed ? "✓" : "•"} {c.rule}
                  {c.detail ? <span className="text-muted"> ({c.detail})</span> : null}
                </li>
              ))}
            </ul>
            <div className="mb-1 mt-3 text-xs font-medium text-muted">Proposed action</div>
            <pre className="overflow-x-auto rounded-md bg-surface-muted p-2 text-xs">{JSON.stringify(a.proposed, null, 2)}</pre>
            <a href={`/activity/${a.runId}`} className="mt-2 inline-block text-xs text-accent hover:underline">
              Full run history and tool data
            </a>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
