"use client";
import { Check, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { connectDirectoryAction, searchDirectoryAction } from "./actions";
import type { DirectoryEntry } from "@/server/integrations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";

export function SystemLogo({ src, name, className = "size-8" }: { src: string | null; name: string; className?: string }) {
  if (!src) {
    return <span className={`${className} flex shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground`}>{name.slice(0, 1)}</span>;
  }
  // Composio serves one logo per toolkit; next/image would need every host allow-listed.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={`${className} shrink-0 rounded-md bg-white object-contain p-0.5`} loading="lazy" />;
}

// "Add systems": the 20 most common systems first, and search across the whole Composio
// directory (about 1,500 systems). Connecting opens the system's own sign-in.
export function AddSystems({ canManage, variant = "default" }: { canManage: boolean; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++seq.current;
    const t = setTimeout(
      async () => {
        setLoading(true);
        const r = await searchDirectoryAction(query);
        if (id !== seq.current) return;
        setLoading(false);
        if (!r.ok) return setError(r.error);
        setError(null);
        setResults(r.data);
      },
      query ? 250 : 0,
    );
    return () => clearTimeout(t);
  }, [open, query]);

  const connect = (slug: string) =>
    start(async () => {
      setConnecting(slug);
      setError(null);
      const r = await connectDirectoryAction(slug);
      setConnecting(null);
      if (r && !r.ok) setError(r.error);
    });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={variant} disabled={!canManage}>
          <Plus />
          Add systems
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add systems</SheetTitle>
          <SheetDescription>Popular systems first. Search to find any of the systems available through Composio.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search, for example HubSpot, Shopify or Xero" aria-label="Search systems" className="pl-8" autoFocus />
          </div>
        </div>
        {error ? (
          <div className="px-4 pb-3">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto border-t px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {query ? "Results" : "Popular"}
            {loading ? <Spinner className="size-3.5" /> : null}
          </div>
          {results && !results.length && !loading ? <p className="py-6 text-center text-sm text-muted-foreground">No system matches &ldquo;{query}&rdquo;.</p> : null}
          <ul className="space-y-1" aria-label="Systems">
            {(results ?? []).map((t) => (
              <li key={t.slug} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60" data-testid={`directory-${t.slug}`}>
                <SystemLogo src={t.logo} name={t.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{t.name}</span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:inline">{t.category}</span>
                  </div>
                  {t.description ? <p className="line-clamp-1 text-xs text-muted-foreground">{t.description}</p> : null}
                </div>
                {t.connected ? (
                  <Badge variant="success">
                    <Check />
                    Connected
                  </Badge>
                ) : t.managedAuth ? (
                  <Button size="sm" variant="outline" disabled={Boolean(connecting)} onClick={() => connect(t.slug)}>
                    {connecting === t.slug ? "Opening…" : "Connect"}
                  </Button>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground" title="This system needs its own sign-in app in Composio first.">
                    Needs setup
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
