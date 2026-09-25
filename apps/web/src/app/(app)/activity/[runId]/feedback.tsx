"use client";
import { useState, useTransition } from "react";
import { Button, Input, Notice } from "@/components/ui";
import { feedbackAction } from "../../agents/actions";

export function Feedback({ runId, current }: { runId: string; current: string | null }) {
  const [verdict, setVerdict] = useState<string | null>(current);
  const [asking, setAsking] = useState(false);
  const [expected, setExpected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = (v: "correct" | "incorrect", text?: string) =>
    start(async () => {
      const r = await feedbackAction(runId, v, text);
      if (!r.ok) return setError(r.error);
      setVerdict(v);
      setAsking(false);
    });
  if (verdict && !asking) return <p className="text-sm text-muted">Thanks, marked {verdict}.</p>;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => send("correct")}>
          Correct
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setAsking(true)}>
          Incorrect
        </Button>
      </div>
      {asking ? (
        <div className="flex gap-2">
          <Input placeholder="What should have happened?" value={expected} onChange={(e) => setExpected(e.target.value)} />
          <Button size="sm" disabled={pending} onClick={() => send("incorrect", expected || undefined)}>
            Send
          </Button>
        </div>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
