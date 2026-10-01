"use client";
import { Copy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Errors that mean the page was built by an older deploy than the server it now talks to.
const SKEW = /ChunkLoadError|Loading chunk|dynamically imported module|Failed to find Server Action|is not a function|reading 'call'/i;

// Once per page per minute: a page that just healed itself and failed again shows the panel.
function firstTry(kind: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const key = `autonomos:${kind}:${window.location.pathname}`;
    if (Date.now() - Number(window.sessionStorage.getItem(key) ?? 0) < 60_000) return false;
    window.sessionStorage.setItem(key, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

// What failed, what to do next, and a reference to quote. The page heals itself first: after a
// deploy it reloads once; any other failure is retried once with fresh data from the server
// before the panel shows. Only a failure that survives the retry asks the person to act.
export function ErrorPanel({ error, reset, what = "this page", links = [] }: { error: Error & { digest?: string }; reset: () => void; what?: string; links?: Array<{ href: string; label: string }> }) {
  const skew = SKEW.test(`${error.name} ${error.message}`);
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [healing] = useState(() => !skew && firstTry("healed"));
  useEffect(() => {
    console.error(error);
    if (healing) {
      const t = setTimeout(() => startTransition(() => {
        router.refresh();
        reset();
      }), 800);
      return () => clearTimeout(t);
    }
    if (!skew) return;
    try {
      const key = `autonomos:reloaded:${window.location.pathname}`;
      const last = Number(window.sessionStorage.getItem(key) ?? 0);
      if (Date.now() - last < 60_000) return;
      window.sessionStorage.setItem(key, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [error, skew, healing, reset, router]);
  const reference = error.digest ?? null;
  if (healing) {
    return (
      <Card className="mx-auto mt-12 max-w-md p-6" role="status" aria-live="polite">
        <h2 className="font-semibold">Fixing this…</h2>
        <p className="mt-1 text-sm text-muted-foreground">Something failed while loading {what}. AutonomOS is trying again with fresh data.</p>
      </Card>
    );
  }
  return (
    <Card className="mx-auto mt-12 max-w-md p-6" role="alert">
      <h2 className="font-semibold">{skew ? "AutonomOS was updated" : `Could not show ${what}`}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {skew
          ? "A new version was released while this page was open. Reload to continue; nothing you saved is lost."
          : "Something failed while loading it. Nothing was changed. Try again, or go somewhere else and come back."}
      </p>
      {reference ? (
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground hover:text-foreground"
          onClick={() => void navigator.clipboard?.writeText(reference).then(() => setCopied(true))}
          title="Copy reference"
        >
          {copied ? "Copied" : `Reference ${reference}`}
          <Copy className="size-3" />
        </button>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {skew ? (
          <Button onClick={() => window.location.reload()}>Reload</Button>
        ) : (
          <>
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </>
        )}
        {links.map((l) => (
          <Button key={l.href} variant="ghost" asChild>
            <Link href={l.href}>{l.label}</Link>
          </Button>
        ))}
      </div>
    </Card>
  );
}
