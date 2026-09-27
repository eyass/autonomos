"use client";
import { useActionState } from "react";
import { renameWorkspaceAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RenameWorkspace({ name }: { name: string }) {
  const [state, action, pending] = useActionState(renameWorkspaceAction, null);
  const error = state && !(state as { ok: boolean }).ok ? (state as { error: string }).error : null;
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input name="name" defaultValue={name} aria-label="Workspace name" className="sm:w-72" required />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Rename"}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : state ? <span className="text-xs text-muted-foreground">Saved</span> : null}
    </form>
  );
}
