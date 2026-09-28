"use client";
import { Check, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { browseToolsAction, connectDirectoryAction, connectSandboxAction } from "@/app/(app)/integrations/actions";
import { SystemLogo } from "@/app/(app)/integrations/add-systems";
import type { BrowseCategory, BrowseTool } from "@/server/tool-browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

// Every system a workspace can connect: categories on the left, their tools on the right,
// the most popular across all categories first. Search looks across everything.
export function ToolBrowser({
  categories,
  initialTools,
  canManage,
  returnTo,
}: {
  categories: BrowseCategory[];
  initialTools: BrowseTool[];
  canManage: boolean;
  // Where a live sign-in comes back to.
  returnTo: string;
}) {
  const [view, setView] = useState("popular");
  const [query, setQuery] = useState("");
  const [tools, setTools] = useState<BrowseTool[]>(initialTools);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    // The first view comes from the server; reload only when the view or search changes.
    if (first.current) {
      first.current = false;
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(
      async () => {
        setLoading(true);
        const r = await browseToolsAction(view, query);
        if (id !== seq.current) return;
        setLoading(false);
        if (!r.ok) return setError(r.error);
        setError(null);
        setTools(r.data);
      },
      query ? 250 : 0,
    );
    return () => clearTimeout(t);
  }, [view, query]);

  const current = categories.find((c) => c.key === view);
  const markConnected = (key: string, provider: string) => setTools((all) => all.map((t) => (t.key === key ? { ...t, connected: true, provider } : t)));

  return (
    <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)]" data-testid="tool-browser">
      <nav aria-label="Tool categories" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 [scrollbar-width:none]">
        {categories.map((c, i) => (
          <div key={c.key} className="contents">
            <button
              type="button"
              onClick={() => setView(c.key)}
              aria-current={view === c.key ? "page" : undefined}
              className={`flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm whitespace-nowrap transition-colors md:w-full ${
                view === c.key ? "bg-brand-soft font-medium text-brand-strong" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              } ${isSpecialEnd(categories, i) ? "md:mb-2" : ""}`}
            >
              <span className="inline-flex items-center gap-1.5">
                {c.key === "popular" ? <Sparkles className="size-3.5" /> : null}
                {c.label}
              </span>
              {c.count !== null ? <span className="text-xs tabular-nums opacity-70">{c.count}</span> : null}
            </button>
          </div>
        ))}
      </nav>
      <section className="min-w-0 space-y-3" aria-live="polite">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold">{query ? `Results for “${query}”` : (current?.label ?? "Tools")}</h2>
          {loading ? <Spinner className="size-4 text-muted-foreground" /> : null}
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all tools" aria-label="Search all tools" className="h-9 pl-8" />
          </div>
        </div>
        {view === "detected" && !query ? <p className="text-xs text-muted-foreground">Named on your website, shown as its tools, or found in your email setup.</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!tools.length && !loading ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{query ? `No tool matches “${query}”.` : "Nothing here yet."}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((t) => (
              <ToolCard key={t.key} tool={t} canManage={canManage} returnTo={returnTo} onConnected={markConnected} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// The line under the special views (Most popular, Found on your website, Connected).
function isSpecialEnd(categories: BrowseCategory[], i: number) {
  const special = (k: string) => k === "popular" || k === "detected" || k === "connected";
  return special(categories[i]!.key) && categories[i + 1] !== undefined && !special(categories[i + 1]!.key);
}

function ToolCard({ tool: t, canManage, returnTo, onConnected }: { tool: BrowseTool; canManage: boolean; returnTo: string; onConnected: (key: string, provider: string) => void }) {
  const [choosing, setChoosing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const available = t.sandbox || t.live;
  const live = () =>
    start(async () => {
      const r = await connectDirectoryAction(t.slug, returnTo);
      if (r && !r.ok) toast.error(r.error);
    });
  const sandbox = () =>
    start(async () => {
      const r = await connectSandboxAction(t.key);
      if (!r.ok) return void toast.error(r.error);
      onConnected(t.key, "sandbox");
      setChoosing(false);
      router.refresh();
    });
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-3" data-testid={`integration-${t.key}`}>
      <div className="flex items-start gap-3">
        <SystemLogo src={t.logo} name={t.name} className="size-8" eager />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium">{t.name}</span>
            {t.detected && !t.connected ? <Badge variant="info">Detected</Badge> : null}
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">{t.description || t.category}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {t.connected ? (
          <Badge variant={t.provider === "sandbox" ? "warning" : "success"}>
            <Check />
            Connected · {t.provider === "sandbox" ? "sandbox" : "live"}
          </Badge>
        ) : !available ? (
          <span className="text-xs text-muted-foreground" title="Its sign-in needs a one-time setup on our side. Contact support and we enable it for your workspace.">
            {t.category === "Other" && !t.logo ? "Not available to connect yet" : "Needs a one-time setup by our team"}
          </span>
        ) : !canManage ? (
          <span className="text-xs text-muted-foreground">An admin can connect it</span>
        ) : choosing ? (
          <>
            {t.live ? (
              <Button size="sm" onClick={live} disabled={pending}>
                {pending ? <Spinner /> : null}
                {t.usesKey ? "Use your API key" : `Sign in to ${t.name}`}
              </Button>
            ) : null}
            {t.sandbox ? (
              <Button size="sm" variant={t.live ? "outline" : "default"} onClick={sandbox} disabled={pending}>
                {pending && !t.live ? <Spinner /> : null}
                Use sandbox data
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setChoosing(false)} disabled={pending}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => (t.sandbox ? setChoosing(true) : live())} disabled={pending}>
              {pending ? <Spinner /> : null}
              Connect
            </Button>
            {t.usesKey ? (
              <span className="text-xs text-muted-foreground" title={`You paste an API key or login from your ${t.name} account on a secure page.`}>
                With your API key
              </span>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}
