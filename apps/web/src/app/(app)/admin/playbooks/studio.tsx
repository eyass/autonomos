"use client";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { requestJob } from "@/components/app/job";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { draftStarterLibraryAction } from "./actions";

// Drafting one playbook: optionally a department and what it should do.
export function DraftForm({ departments }: { departments: readonly string[] }) {
  const [department, setDepartment] = useState("");
  const [goal, setGoal] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = () =>
    start(async () => {
      const r = await requestJob("playbook", { ...(department ? { department } : {}), ...(goal.trim() ? { goal: goal.trim() } : {}) });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Drafting. It appears in the library when it is ready.");
      setGoal("");
      router.refresh();
    });
  return (
    <Card className="gap-4 px-4 py-4 sm:gap-4 sm:py-4">
      <div className="space-y-1.5">
        <Label htmlFor="pb-department">Department</Label>
        <NativeSelect id="pb-department" value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">Any</option>
          {departments.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pb-goal">What it should do (optional)</Label>
        <Textarea id="pb-goal" value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} maxLength={500} placeholder="For example: handle refund requests against the refund policy" />
        <p className="text-xs text-muted-foreground">Leave it empty and AI picks valuable common work that has no playbook yet.</p>
      </div>
      <Button onClick={submit} disabled={pending}>
        {pending ? <Spinner /> : <Sparkles />}
        Draft with AI
      </Button>
    </Card>
  );
}

export function DraftStarter({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await draftStarterLibraryAction();
          if (!r.ok) return void toast.error(r.error);
          toast.success(`Drafting ${r.data.started} playbooks.`);
          router.refresh();
        })
      }
    >
      {pending ? <Spinner /> : <Sparkles />}
      Draft a starter library ({count})
    </Button>
  );
}

type Job = { id: string; label: string; status: string; error: string | null };

// Drafts under way. Reading each job also restarts one whose server stopped.
export function DraftQueue({ jobs }: { jobs: Job[] }) {
  const router = useRouter();
  const ids = jobs
    .filter((j) => j.status !== "failed")
    .map((j) => j.id)
    .join(",");
  useEffect(() => {
    if (!ids) return;
    const timer = setInterval(async () => {
      const states = await Promise.all(
        ids.split(",").map((id) =>
          fetch(`/api/jobs/${id}`, { cache: "no-store" })
            .then((r) => r.json() as Promise<{ data?: { status: string } }>)
            .catch(() => null),
        ),
      );
      if (states.some((s) => s?.data && s.data.status !== "queued" && s.data.status !== "running")) router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [ids, router]);
  if (!jobs.length) return null;
  return (
    <Card className="gap-0 py-0 sm:gap-0 sm:py-0" data-testid="draft-queue">
      {jobs.map((j) => (
        <div key={j.id} className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-0">
          {j.status === "failed" ? <Badge variant="danger">Failed</Badge> : <Spinner className="text-muted-foreground" />}
          <div className="min-w-0 flex-1">
            <div className="truncate">
              {j.status === "failed" ? "Could not draft" : "Drafting"}: {j.label}
            </div>
            {j.error ? <div className="truncate text-xs text-muted-foreground">{j.error}</div> : null}
          </div>
        </div>
      ))}
    </Card>
  );
}
