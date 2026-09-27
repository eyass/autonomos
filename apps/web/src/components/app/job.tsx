"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { JobKind, JobView } from "@/server/jobs";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

// Following a background job from the page. The work runs on the server (see server/jobs.ts),
// so the page can be closed or reloaded at any time: it picks the job back up from the
// initial job the server passes in, and the result is kept for when it comes back.

const POLL_MS = 1_500;
const nowMs = () => Date.now();
const active = (j: JobView | null) => j?.status === "queued" || j?.status === "running";

type Started = { ok: true; data: JobView } | { ok: false; error: string };

export async function requestJob(kind: JobKind, input: Record<string, unknown> = {}): Promise<Started> {
  try {
    const res = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, input }) });
    const json = (await res.json()) as Started;
    return json;
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

async function readJob(id: string, signal: AbortSignal): Promise<JobView | null> {
  try {
    const res = await fetch(`/api/jobs/${id}`, { signal, cache: "no-store" });
    const json = (await res.json()) as { ok: boolean; data?: JobView };
    return json.ok && json.data ? json.data : null;
  } catch {
    return null;
  }
}

// Follows a job until it finishes, then calls onFinish once with the finished job.
export function useJob(initial: JobView | null, onFinish?: (job: JobView) => void) {
  const [job, setJob] = useState<JobView | null>(initial);
  const [elapsed, setElapsed] = useState(initial?.elapsed ?? 0);
  const finish = useRef(onFinish);
  useEffect(() => {
    finish.current = onFinish;
  });
  const base = useRef({ elapsed: initial?.elapsed ?? 0, at: 0 });

  const follow = useCallback((j: JobView) => {
    base.current = { elapsed: j.elapsed, at: nowMs() };
    setJob(j);
    setElapsed(j.elapsed);
    if (!active(j)) finish.current?.(j);
  }, []);

  const id = active(job) ? job!.id : null;
  useEffect(() => {
    if (!id) return;
    base.current.at ||= nowMs();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const j = await readJob(id, controller.signal);
      if (controller.signal.aborted) return;
      if (j) follow(j);
      if (!j || active(j)) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    const tick = setInterval(() => setElapsed(base.current.elapsed + Math.round((nowMs() - base.current.at) / 1000)), 1000);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [id, follow]);

  return { job, elapsed, running: active(job), follow };
}

// Where a finished job sends the person: its own page, or a refresh of this one.
export function useJobDone() {
  const router = useRouter();
  return useCallback(
    (j: JobView) => {
      if (j.status === "failed") return void toast.error(j.error ?? "It did not finish. Try again.");
      const href = j.result?.href;
      if (!href) return router.refresh();
      // Routes under /api set cookies (switching workspace), so they need a full navigation.
      if (href.startsWith("/api/")) window.location.assign(href);
      else router.push(href);
    },
    [router],
  );
}

const LEAVE_NOTE = "This runs on our servers, so you can leave this page; you are notified when it is done.";

export function JobProgress({ label, elapsed, className, note = LEAVE_NOTE }: { label: string; elapsed: number; className?: string; note?: string }) {
  return (
    <p className={className ?? "text-xs text-muted-foreground"} role="status">
      {label}… <span className="tabular-nums">{elapsed}s</span>. {note}
    </p>
  );
}

// A button that starts a background job and follows it.
export function JobButton({
  kind,
  input,
  initialJob = null,
  children,
  pendingLabel,
  variant,
  size,
  className,
  disabled,
}: {
  kind: JobKind;
  input?: Record<string, unknown>;
  initialJob?: JobView | null;
  children: ReactNode;
  pendingLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  disabled?: boolean;
}) {
  const done = useJobDone();
  const { running, elapsed, follow, job } = useJob(initialJob, done);
  const [starting, start] = useTransition();
  const busy = running || starting;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={busy || disabled}
        onClick={() =>
          start(async () => {
            const r = await requestJob(kind, input);
            if (!r.ok) return void toast.error(r.error);
            follow(r.data);
          })
        }
      >
        {busy ? <Spinner /> : null}
        {busy ? (pendingLabel ?? children) : children}
      </Button>
      {running && job ? <JobProgress label={job.label} elapsed={elapsed} className="max-w-72 text-xs text-muted-foreground" /> : null}
    </span>
  );
}
