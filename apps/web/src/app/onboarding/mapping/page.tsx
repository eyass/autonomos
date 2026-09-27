import { CheckCircle2, Circle, Loader2, MinusCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LiveRefresh } from "@/app/(app)/activity/[runId]/live";
import { ActionButton } from "@/components/action-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { isStale, loadMapping, type MappingStep } from "@/server/first-inventory";
import { retryMappingAction } from "../actions";
import { Steps } from "../steps";
import { AutoRedirect } from "./auto-redirect";

export const metadata = { title: "Mapping your processes" };
export const maxDuration = 300;

const ICON: Record<MappingStep["state"], { icon: typeof Circle; className: string }> = {
  done: { icon: CheckCircle2, className: "text-success" },
  running: { icon: Loader2, className: "animate-spin text-primary" },
  pending: { icon: Circle, className: "text-muted-foreground/50" },
  skipped: { icon: MinusCircle, className: "text-muted-foreground" },
  failed: { icon: XCircle, className: "text-destructive" },
};

function secondsSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}

export default async function MappingPage() {
  const session = await getSession();
  if (!session) redirect("/onboarding/company");
  const progress = await loadMapping(session.org.id);
  if (!progress) redirect(session.org.onboardingCompletedAt ? "/" : "/onboarding/connect");
  const stale = isStale(progress);
  const status = stale ? "failed" : progress.status;
  const finished = progress.steps.filter((s) => s.state !== "pending" && s.state !== "running").length;
  const running = progress.steps.find((s) => s.state === "running");
  // A running step counts as half done, so the bar moves while a slow step works.
  const percent = status === "done" ? 100 : Math.round(((finished + (running ? 0.5 : 0)) / progress.steps.length) * 100);
  const next = progress.drafted > 0 ? `/processes?status=draft&drafted=${progress.drafted}` : "/discover?welcome=1";
  const elapsed = secondsSince(progress.startedAt);

  return (
    <>
      <LiveRefresh active={status === "running"} />
      {status === "done" ? <AutoRedirect href={next} /> : null}
      <Steps current={2} />
      <h1 className="mb-1 text-xl font-semibold">{status === "done" ? "Your first process inventory is ready" : status === "failed" ? "Mapping stopped" : "Mapping your processes"}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {status === "done"
          ? progress.drafted
            ? `${progress.drafted} process${progress.drafted === 1 ? "" : "es"} drafted. Taking you to review them.`
            : "Nothing clear enough to draft yet. Taking you to discovery."
          : status === "failed"
            ? "Part of the work did not finish. You can try again or continue without it."
            : "AutonomOS is reading what you shared and drafting the recurring work it finds. You can leave this page; it keeps going."}
      </p>

      <Card>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span>{running ? running.label : status === "done" ? "Done" : status === "failed" ? "Stopped" : "Starting"}</span>
              <span className="tabular-nums">
                {percent}% · {elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`}
              </span>
            </div>
            <Progress value={percent} aria-label="Mapping progress" />
          </div>
          <ol className="space-y-1" data-testid="mapping-steps">
            {progress.steps.map((s) => {
              const { icon: Icon, className } = ICON[stale && s.state === "running" ? "failed" : s.state];
              return (
                <li key={s.key} className={cn("flex items-start gap-3 rounded-md px-2 py-2 transition-colors", s.state === "running" && "bg-primary/5")}>
                  <Icon className={cn("mt-0.5 size-4 shrink-0", className)} />
                  <div className="min-w-0">
                    <div className={cn("text-sm", s.state === "pending" ? "text-muted-foreground" : "font-medium")}>{s.label}</div>
                    {s.detail ? <div className="text-xs text-muted-foreground">{s.detail}</div> : null}
                  </div>
                </li>
              );
            })}
          </ol>
          {status === "done" && progress.titles.length ? (
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="mb-1 text-xs text-muted-foreground">Among the drafts</div>
              <ul className="list-inside list-disc space-y-0.5">
                {progress.titles.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap gap-2">
        {status === "done" ? (
          <Button asChild>
            <Link href={next}>{progress.drafted ? "Review your drafts" : "Continue"}</Link>
          </Button>
        ) : status === "failed" ? (
          <>
            <ActionButton action={retryMappingAction} pendingLabel="Starting…">
              Try again
            </ActionButton>
            <Button asChild variant="outline">
              <Link href="/discover?welcome=1">Continue without it</Link>
            </Button>
          </>
        ) : (
          <Button asChild variant="ghost">
            <Link href="/discover?welcome=1">Skip to the app</Link>
          </Button>
        )}
      </div>
      {progress.error && status === "failed" ? (
        <Alert variant="warning" className="mt-4">
          <AlertDescription>{progress.error}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
