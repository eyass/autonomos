"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "./ui";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

export function ActionButton({
  action,
  children,
  variant,
  size,
  confirm,
  pendingLabel,
  onDone,
  className,
}: {
  action: () => Promise<Result>;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "link";
  size?: "sm" | "md" | "lg";
  confirm?: string;
  pendingLabel?: string;
  onDone?: (data: unknown) => void;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          start(async () => {
            const result = await action();
            if (!result.ok) {
              setError(result.error);
              return;
            }
            onDone?.(result.data);
            router.refresh();
          });
        }}
      >
        {pending ? (pendingLabel ?? "Working…") : children}
      </Button>
      {error ? <span className="max-w-sm text-xs text-danger">{error}</span> : null}
    </span>
  );
}
