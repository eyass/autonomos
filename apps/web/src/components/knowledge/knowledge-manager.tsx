"use client";
import { BookText, CircleAlert, ExternalLink, FileText, Globe, LifeBuoy, Link2, RotateCw, Trash2, Type, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addPasteSourceAction, addUrlSourceAction, originalFileAction, readAgainAction, removeSourceAction } from "@/app/(app)/knowledge/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CompanyBrief } from "@autonomos/schemas";
import type { KnowledgeSourceView } from "@/server/knowledge";

// Company knowledge: add sources (files, a help-centre address, pasted text), follow them being
// read, and see the brief they build. Used on the onboarding step and on the Knowledge page.

const KIND: Record<KnowledgeSourceView["kind"], { label: string; icon: typeof Globe }> = {
  website: { label: "Website", icon: Globe },
  help_center: { label: "Help centre", icon: LifeBuoy },
  url: { label: "Web page", icon: Link2 },
  file: { label: "File", icon: FileText },
  paste: { label: "Text", icon: Type },
};
const busy = (s: KnowledgeSourceView) => s.status === "queued" || s.status === "processing";

export function KnowledgeManager({
  initialSources,
  initialBrief,
  canEdit,
  onChange,
}: {
  initialSources: KnowledgeSourceView[];
  initialBrief: CompanyBrief | null;
  canEdit: boolean;
  // Told whenever the list changes (the onboarding step enables Continue from it).
  onChange?: (sources: KnowledgeSourceView[]) => void;
}) {
  const [sources, setSources] = useState(initialSources);
  const [brief, setBrief] = useState(initialBrief);
  const refresh = useCallback(async () => {
    const r = await fetch("/api/knowledge/sources", { cache: "no-store" });
    if (!r.ok) return;
    const body = (await r.json()) as { ok: boolean; data?: { sources: KnowledgeSourceView[]; brief: CompanyBrief | null } };
    if (!body.ok || !body.data) return;
    setSources(body.data.sources);
    setBrief(body.data.brief);
  }, []);
  useEffect(() => onChange?.(sources), [sources, onChange]);
  // Follow the reading while any source is still being read.
  const reading = sources.some(busy);
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [reading, refresh]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-6">
        {canEdit ? <AddSources onAdded={refresh} /> : null}
        <SourceList sources={sources} canEdit={canEdit} onChanged={refresh} />
      </div>
      <BriefView brief={brief} sources={sources} reading={reading} />
    </div>
  );
}

function AddSources({ onAdded }: { onAdded: () => Promise<void> }) {
  const [pending, start] = useTransition();
  const [drag, setDrag] = useState(false);
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState({ title: "", text: "" });
  const [showPaste, setShowPaste] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = (files: FileList | File[]) =>
    start(async () => {
      const list = [...files];
      if (!list.length) return;
      const form = new FormData();
      for (const f of list) form.append("file", f);
      const r = await fetch("/api/knowledge/upload", { method: "POST", body: form });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; data?: { added: string[]; failed: Array<{ name: string; error: string }> }; error?: string };
      if (!r.ok || !body.data) return void toast.error(body.error ?? "Upload failed");
      const data = body.data;
      for (const f of data.failed) toast.error(`${f.name}: ${f.error}`);
      if (data.added.length) toast.success(`${data.added.length} file${data.added.length === 1 ? "" : "s"} added; reading now`);
      await onAdded();
    });
  const addUrl = () =>
    start(async () => {
      const r = await addUrlSourceAction(url);
      if (!r.ok) return void toast.error(r.error);
      setUrl("");
      toast.success("Help centre added; reading every article now");
      await onAdded();
    });
  const addPaste = () =>
    start(async () => {
      const r = await addPasteSourceAction(paste);
      if (!r.ok) return void toast.error(r.error);
      setPaste({ title: "", text: "" });
      setShowPaste(false);
      await onAdded();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add what you know</CardTitle>
        <CardDescription>Support documents, policies, handbooks, your help centre. Each source is read in the background and adds to the brief.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            upload(e.dataTransfer.files);
          }}
          disabled={pending}
          className={cn(
            "flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
            drag ? "border-primary bg-brand-soft" : "border-border bg-muted/30 hover:border-primary/40 hover:bg-brand-soft/40",
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-area-green-soft text-area-green-strong">{pending ? <Spinner /> : <Upload className="size-5" />}</span>
          <span className="text-sm font-medium">Drop files here or choose them</span>
          <span className="text-xs text-muted-foreground">PDF, DOCX, TXT or MD, up to 10 MB each</span>
        </button>
        <input ref={input} type="file" multiple accept=".pdf,.docx,.txt,.md" className="hidden" aria-label="Choose files" onChange={(e) => e.target.files && upload(e.target.files)} />

        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            addUrl();
          }}
        >
          <Label htmlFor="knowledge-url">Help centre or support site</Label>
          <div className="flex gap-2">
            <Input id="knowledge-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="help.yourcompany.com" inputMode="url" />
            <Button type="submit" variant="outline" disabled={pending || url.trim().length < 3}>
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Every article is read, up to 2,000.</p>
        </form>

        {showPaste ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              addPaste();
            }}
          >
            <Label htmlFor="knowledge-paste-title">Paste text</Label>
            <Input id="knowledge-paste-title" value={paste.title} onChange={(e) => setPaste((p) => ({ ...p, title: e.target.value }))} placeholder="Title, for example Refund policy" />
            <Textarea aria-label="Text to add" value={paste.text} onChange={(e) => setPaste((p) => ({ ...p, text: e.target.value }))} rows={6} placeholder="Paste the text" />
            <div className="flex gap-2">
              <Button type="submit" disabled={pending || paste.text.trim().length < 40}>
                Add text
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowPaste(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowPaste(true)}>
            <Type /> Paste text instead
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function SourceList({ sources, canEdit, onChanged }: { sources: KnowledgeSourceView[]; canEdit: boolean; onChanged: () => Promise<void> }) {
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, done?: (data: unknown) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error ?? "Failed");
      done?.(r.data);
      await onChanged();
    });
  if (!sources.length) return null;
  return (
    <Card className="gap-0 py-0 sm:gap-0 sm:py-0">
      <CardHeader className="border-b border-border py-4 sm:py-5">
        <CardTitle>Sources</CardTitle>
        <CardDescription>
          {sources.filter((s) => s.status === "ready").length} of {sources.length} read · {sources.reduce((n, s) => n + s.passages, 0).toLocaleString("en")} passages
        </CardDescription>
      </CardHeader>
      <ul className="divide-y divide-border" data-testid="knowledge-sources">
        {sources.map((s) => {
          const kind = KIND[s.kind];
          return (
            <li key={s.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-6">
              <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <kind.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">{s.title}</span>
                  <StatusBadge s={s} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{progress(s)}</p>
                {s.status === "failed" && s.error ? (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {s.error}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {s.hasFile ? (
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Open ${s.title}`} disabled={pending} onClick={() => act(() => originalFileAction(s.id), (link) => window.open(String(link), "_blank", "noopener"))}>
                    <ExternalLink />
                  </Button>
                ) : null}
                {canEdit && !busy(s) && (s.kind === "website" || s.kind === "help_center" || s.kind === "url" || s.status === "failed") ? (
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Read ${s.title} again`} disabled={pending} onClick={() => act(() => readAgainAction(s.id))}>
                    <RotateCw />
                  </Button>
                ) : null}
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${s.title}`}
                    disabled={pending}
                    onClick={() => confirm(`Remove ${s.title}? What it added to the brief is removed too.`) && act(() => removeSourceAction(s.id))}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function StatusBadge({ s }: { s: KnowledgeSourceView }) {
  if (s.status === "ready") return <Badge variant="success">Read</Badge>;
  if (s.status === "failed") return <Badge variant="danger">Could not read</Badge>;
  return (
    <Badge variant="agent" className="gap-1">
      <span aria-hidden className="signal-pulse size-1.5 rounded-full bg-highlight" />
      {s.status === "queued" ? "Waiting" : "Reading"}
    </Badge>
  );
}

function progress(s: KnowledgeSourceView): string {
  const c = s.counts;
  if (s.status === "ready") return s.summary ?? `${s.passages.toLocaleString("en")} passages`;
  if (s.kind === "website" || s.kind === "help_center" || s.kind === "url") {
    if (!c) return s.status === "queued" ? "Starting" : "Finding pages";
    return `${(c.read ?? 0).toLocaleString("en")} pages read of ${(c.found ?? 0).toLocaleString("en")} found${c.sampledOut ? `, ${c.sampledOut.toLocaleString("en")} similar pages sampled` : ""}`;
  }
  return s.status === "queued" ? "Waiting to be read" : "Reading";
}

function BriefView({ brief, sources, reading }: { brief: CompanyBrief | null; sources: KnowledgeSourceView[]; reading: boolean }) {
  const title = (id: string) => sources.find((s) => s.id === id)?.title ?? "A removed source";
  const empty = !brief || (!brief.summary && !brief.facts.length && !brief.policies.length);
  return (
    <Card className="h-fit bg-gradient-to-br from-area-green-soft to-card to-60%">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BookText className="size-4 text-area-green-strong" aria-hidden />
          <CardTitle>What AutonomOS knows</CardTitle>
          {reading ? <Spinner className="size-3.5 text-muted-foreground" /> : null}
        </div>
        <CardDescription>The brief your agents and discovery work from. It grows with every source.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm" data-testid="company-brief">
        {empty ? (
          <p className="text-muted-foreground">{reading ? "Reading your sources. The brief fills in as each one is done." : "Add a source to start the brief."}</p>
        ) : (
          <>
            {brief!.summary ? <p className="leading-relaxed">{brief!.summary}</p> : null}
            {brief!.offering.length ? <Block title="What you offer" items={brief!.offering} /> : null}
            {brief!.customers ? <Block title="Customers" items={[brief!.customers]} /> : null}
            {brief!.policies.length ? (
              <section>
                <h3 className="eyebrow text-[11px] text-muted-foreground">Policies</h3>
                <ul className="mt-2 space-y-2">
                  {brief!.policies.map((p, i) => (
                    <li key={i} className="rounded-lg border border-border bg-card px-3 py-2">
                      <span className="font-medium">{p.topic}: </span>
                      {p.rule}
                      <span className="mt-0.5 block text-xs text-muted-foreground">From {title(p.sourceId)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {brief!.tone ? <Block title="Tone with customers" items={[brief!.tone]} /> : null}
            {brief!.terminology.length ? <Block title="Your terms" items={brief!.terminology.map((t) => `${t.term}: ${t.meaning}`)} /> : null}
            {brief!.facts.length ? (
              <section>
                <h3 className="eyebrow text-[11px] text-muted-foreground">Also known</h3>
                <ul className="mt-2 space-y-1.5">
                  {brief!.facts.slice(0, 30).map((f, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-area-green" />
                      <span>
                        {f.text} <span className="text-xs text-muted-foreground">· {title(f.sourceId)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="eyebrow text-[11px] text-muted-foreground">{title}</h3>
      <ul className="mt-1.5 space-y-1">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}
