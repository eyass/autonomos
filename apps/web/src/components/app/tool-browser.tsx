"use client";
import { Check, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { browseToolsAction, connectDirectoryAction, connectSandboxAction } from "@/app/(app)/integrations/actions";
import { SystemLogo } from "@/app/(app)/integrations/add-systems";
import type { BrowseCategory, BrowseEntry, BrowseTool } from "@/server/tool-browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

// Every system a workspace can connect: categories on the left, their tools on the right,
// the most popular across all categories first. Search looks across everything.
export function ToolBrowser({
  categories,
  initialTools,
  special,
  connected,
  detected,
  canManage,
  returnTo,
}: {
  categories: BrowseCategory[];
  initialTools: BrowseTool[];
  // The Found on your website and Connected views, built on the server.
  special: Partial<Record<string, BrowseTool[]>>;
  // The workspace's own state, laid over the (cached) directory.
  connected: Record<string, string | null>;
  detected: string[];
  canManage: boolean;
  // Where a live sign-in comes back to.
  returnTo: string;
}) {
  const [view, setView] = useState("popular");
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<BrowseTool[]>(initialTools);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [justConnected, setJustConnected] = useState<Record<string, string>>({});
  const all = useDirectory(connected, detected);
  const seq = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    // Once the whole directory is here every view is worked out in the browser. Until then
    // (the first seconds of a visit) the server answers, as it did before.
    if (first.current) {
      first.current = false;
      return;
    }
    if (all || special[view]) return;
    const id = ++seq.current;
    const t = setTimeout(
      async () => {
        setLoading(true);
        const r = await browseToolsAction(view, query);
        if (id !== seq.current) return;
        setLoading(false);
        if (!r.ok) return setError(r.error);
        setError(null);
        setRemote(r.data);
      },
      query ? 250 : 0,
    );
    return () => clearTimeout(t);
  }, [view, query, all, special]);

  const computed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inView = special[view];
    if (inView) return q ? inView.filter((t) => t.name.toLowerCase().includes(q)) : inView;
    if (!all) return null;
    return q ? searchAll(all, q) : view === "popular" ? popular(all) : inGroup(all, view);
  }, [all, view, query, special]);
  const tools = (computed ?? remote).map((t) => (justConnected[t.key] ? { ...t, connected: true, provider: justConnected[t.key]! } : t));
  const shown = tools.slice(0, limit);

  const current = categories.find((c) => c.key === view);
  const markConnected = (key: string, provider: string) => setJustConnected((m) => ({ ...m, [key]: provider }));

  return (
    <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)]" data-testid="tool-browser">
      <nav aria-label="Tool categories" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 [scrollbar-width:none]">
        {categories.map((c, i) => (
          <div key={c.key} className="contents">
            <button
              type="button"
              onClick={() => {
                setView(c.key);
                setLimit(PAGE);
              }}
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
          {loading && !computed ? <Spinner className="size-4 text-muted-foreground" /> : null}
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Search all tools"
              aria-label="Search all tools"
              className="h-9 pl-8"
            />
          </div>
        </div>
        {view === "detected" && !query ? <p className="text-xs text-muted-foreground">Named on your website, shown as its tools, or found in your email setup.</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!tools.length && !(loading && !computed) ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{query ? `No tool matches “${query}”.` : "Nothing here yet."}</p>
        ) : (
          <>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((t, i) => (
                <ToolCard key={t.key} tool={t} eager={i < 12} canManage={canManage} returnTo={returnTo} onConnected={markConnected} />
              ))}
            </ul>
            {tools.length > shown.length ? (
              <div className="flex justify-center pt-1">
                <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE * 2)}>
                  Show more ({tools.length - shown.length})
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

const PAGE = 60;

// The whole directory, fetched once in the background (the browser keeps it for an hour),
// with this workspace's connections and detected tools laid over it.
function useDirectory(connected: Record<string, string | null>, detected: string[]) {
  const [raw, setRaw] = useState<BrowseEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/tools/directory")
      .then((r) => (r.ok ? (r.json() as Promise<{ tools: BrowseEntry[] }>) : null))
      .then((d) => {
        if (live && d?.tools.length) setRaw(d.tools);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return useMemo(() => {
    if (!raw) return null;
    const found = new Set(detected);
    return raw.map((t) => ({ ...t, connected: t.key in connected, provider: connected[t.key] ?? null, detected: found.has(t.key) }));
  }, [raw, connected, detected]);
}

const byRank = (a: BrowseEntry, b: BrowseEntry) => a.rank - b.rank || a.order - b.order || a.name.localeCompare(b.name);

function popular(all: BrowseEntry[]) {
  const known = all.filter((t) => t.rank < 999);
  return (known.length ? known : all).sort(byRank).slice(0, 36);
}

function inGroup(all: BrowseEntry[], group: string) {
  return all.filter((t) => t.groups.includes(group)).sort(byRank);
}

// Name matches first, then category and description matches, best known first.
function searchAll(all: BrowseEntry[], q: string) {
  const compact = q.replace(/\s+/g, "");
  const score = (t: BrowseEntry) => {
    const name = t.name.toLowerCase();
    if (name === q || t.slug === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(q) || t.slug.includes(compact)) return 2;
    if (t.category.toLowerCase().includes(q)) return 3;
    if (t.description.toLowerCase().includes(q)) return 4;
    return 9;
  };
  return all
    .map((t) => ({ t, s: score(t) }))
    .filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s || byRank(a.t, b.t))
    .slice(0, 60)
    .map((x) => x.t);
}

// The line under the special views (Most popular, Found on your website, Connected).
function isSpecialEnd(categories: BrowseCategory[], i: number) {
  const special = (k: string) => k === "popular" || k === "detected" || k === "connected";
  return special(categories[i]!.key) && categories[i + 1] !== undefined && !special(categories[i + 1]!.key);
}

function ToolCard({
  tool: t,
  eager,
  canManage,
  returnTo,
  onConnected,
}: {
  tool: BrowseTool;
  eager: boolean;
  canManage: boolean;
  returnTo: string;
  onConnected: (key: string, provider: string) => void;
}) {
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
        <SystemLogo src={t.logo} name={t.name} className="size-8" eager={eager} />
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
