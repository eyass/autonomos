"use client";
import { useState } from "react";
import type { JobView } from "@/server/jobs";
import { JobButton } from "@/components/app/job";
import { Input } from "@/components/ui/input";

// Approve (and find ideas) or find more ideas. Approval is refused while the process is still
// thin, and work in a regulated area needs a named compliance owner first; both are also
// enforced on the server, this only says so up front.
export function IdeasButton({
  processId,
  approve,
  label,
  pendingLabel,
  initialJob,
  blockedBy,
  sensitive,
  complianceOwner,
  unconfirmed = false,
  confidence = null,
}: {
  processId: string;
  approve: boolean;
  label: string;
  pendingLabel: string;
  initialJob: JobView | null;
  blockedBy: string[];
  sensitive: string[];
  complianceOwner: string | null;
  unconfirmed?: boolean;
  confidence?: number | null;
}) {
  const [owner, setOwner] = useState("");
  const [checked, setChecked] = useState(false);
  // An AI guess nothing in the data backs: approving it says a person checked it.
  const needsCheck = approve && unconfirmed;
  const needsOwner = sensitive.length > 0 && !complianceOwner;
  const blocked = blockedBy.length > 0;
  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      {needsOwner && !blocked ? (
        <label className="flex max-w-72 flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Involves {sensitive.join(" and ")}. Who signs off on compliance?</span>
          <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Name or team, e.g. Legal (Sam Lee)" aria-label="Compliance sign-off by" className="h-8" />
        </label>
      ) : null}
      {needsCheck && !blocked ? (
        <label className="flex max-w-72 items-start gap-2 text-xs">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
          <span className="text-muted-foreground">
            Drafted by AI{confidence !== null ? ` at ${Math.round(confidence * 100)}% confidence` : ""}, and nothing in your data backs it yet. I checked the steps and numbers against how we really do
            this work.
          </span>
        </label>
      ) : null}
      <JobButton
        kind="opportunities"
        input={{ processId, approve, ...(needsOwner && owner.trim() ? { complianceOwner: owner.trim() } : {}), ...(needsCheck && checked ? { confirmed: true } : {}) }}
        initialJob={initialJob}
        pendingLabel={pendingLabel}
        disabled={blocked || (needsOwner && owner.trim().length < 2) || (needsCheck && !checked)}
      >
        {label}
      </JobButton>
      {blocked ? (
        <span className="max-w-72 text-xs text-muted-foreground">
          {approve ? "Approve" : "Ideas"} unlock once these are filled in: {blockedBy.join("; ").toLowerCase()}.
        </span>
      ) : null}
    </span>
  );
}
