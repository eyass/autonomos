"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

// Runs a server action. Destructive actions confirm in a shadcn AlertDialog; failures show as a toast.
export function ActionButton({
  action,
  children,
  variant,
  size,
  confirm,
  confirmLabel = "Confirm",
  pendingLabel,
  onDone,
  className,
}: {
  action: () => Promise<Result>;
  children: ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  confirm?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  onDone?: (data: unknown) => void;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const router = useRouter();
  const run = () =>
    start(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onDone?.(result.data);
      router.refresh();
    });
  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} disabled={pending} onClick={() => (confirm ? setAsking(true) : run())}>
        {pending ? <Spinner /> : null}
        {pending ? (pendingLabel ?? children) : children}
      </Button>
      {confirm ? (
        <AlertDialog open={asking} onOpenChange={setAsking}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm}</AlertDialogTitle>
              <AlertDialogDescription>This is recorded in the audit log.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className={variant === "destructive" ? "bg-destructive text-white hover:bg-destructive/90" : undefined} onClick={run}>
                {confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
