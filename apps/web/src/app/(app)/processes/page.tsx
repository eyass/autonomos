import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FilterBar } from "@/components/filter-bar";
import { LevelChange, Scores, StatusBadge } from "@/components/domain";
import { FREQUENCY_LABEL, hours } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/app/button-link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { WorkTabs } from "@/components/app/work-tabs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { embeddedCount, estimateHeld, processGaps } from "@/lib/process-gaps";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TONE, toneFor } from "@/components/app/area";

export const metadata = { title: "Processes" };

// Long inventories are paged, so the list stays quick to scan and to render.
const PAGE_SIZE = 25;

const SORTS = {
  time: "Most hours per month",
  potential: "Highest automation potential",
  value: "Highest business value",
  difficulty: "Lowest difficulty",
} as const;

export default async function ProcessesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSession();
  const q = await searchParams;
  const supabase = await createClient();
  const [{ data: departments }, { data: rows }, { data: liveAgents }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("organization_id", session.org.id).is("archived_at", null).order("name"),
    supabase
      .from("processes")
      .select(
        "id, title, status, frequency, department_id, estimated_occurrences_per_month, estimated_minutes_per_occurrence, missing_information, current_autonomy_level, potential_autonomy_level, business_value, automation_difficulty, risk_level, confidence, process_steps(count), departments(name)",
      )
      .eq("organization_id", session.org.id),
    supabase.from("agents").select("process_id, autonomy_level").eq("organization_id", session.org.id).eq("status", "active"),
  ]);
  // A process runs at the level of its best live agent (same rule as the autonomy score).
  const agentLevel = new Map<string, number>();
  for (const a of liveAgents ?? []) agentLevel.set(a.process_id, Math.max(agentLevel.get(a.process_id) ?? 1, a.autonomy_level));
  const effective = (p: { id: string; current_autonomy_level: number }) => Math.max(p.current_autonomy_level, agentLevel.get(p.id) ?? 1);

  const monthly = (p: { estimated_occurrences_per_month: number | null; estimated_minutes_per_occurrence: number | null }) =>
    Number(p.estimated_occurrences_per_month ?? 0) * Number(p.estimated_minutes_per_occurrence ?? 0);
  // Drafts waiting for a person come first: with any, the list opens on them.
  const toReview = (rows ?? []).filter((p) => p.status === "draft").length;
  // Candidates are thin finds kept out of the inventory until someone fills them in.
  const candidates = (rows ?? []).filter((p) => p.status === "candidate").length;
  const inventory = (rows ?? []).filter((p) => p.status !== "archived" && p.status !== "candidate").length;
  const view = q.status ? "filtered" : (q.view ?? (toReview ? "review" : "all"));
  let list = (rows ?? []).filter((p) =>
    q.status ? p.status === q.status : view === "review" ? p.status === "draft" : view === "candidates" ? p.status === "candidate" : p.status !== "archived" && p.status !== "candidate",
  );
  if (q.department) list = list.filter((p) => p.department_id === q.department);
  if (q.autonomy) list = list.filter((p) => String(effective(p)) === q.autonomy);
  if (q.risk) list = list.filter((p) => (q.risk === "high" ? p.risk_level >= 4 : q.risk === "low" ? p.risk_level <= 2 : p.risk_level === 3));
  if (q.value) list = list.filter((p) => (q.value === "high" ? p.business_value >= 4 : p.business_value <= 3));
  if (q.q) list = list.filter((p) => p.title.toLowerCase().includes(q.q!.toLowerCase()));
  const sort = (q.sort && q.sort in SORTS ? q.sort : "time") as keyof typeof SORTS;
  list.sort((a, b) => {
    if (sort === "time") return monthly(b) - monthly(a);
    if (sort === "value") return b.business_value - a.business_value;
    if (sort === "difficulty") return a.automation_difficulty - b.automation_difficulty;
    return b.potential_autonomy_level - effective(b) - (a.potential_autonomy_level - effective(a)) || monthly(b) - monthly(a);
  });

  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(q.page) || 1));
  list = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageHref = (n: number) => {
    const params = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => Boolean(e[1]) && e[0] !== "page"));
    if (n > 1) params.set("page", String(n));
    return `/processes${params.size ? `?${params}` : ""}`;
  };

  const actions = (
    <>
      <ButtonLink href="/processes/new" variant="outline">
        Add manually
      </ButtonLink>
      <ButtonLink href="/discover">Find processes</ButtonLink>
    </>
  );

  if (!rows?.length) {
    return (
      <>
        <PageHeader title="Work" description="Your recurring work, and ideas to automate it." actions={actions} />
        <WorkTabs active="processes" />
        <EmptyState
          title="No processes yet."
          description="Describe how your team works and AutonomOS turns it into a structured inventory you can review."
          action={<ButtonLink href="/discover">Start AI discovery</ButtonLink>}
        />
      </>
    );
  }

  const active = [q.department, q.status, q.autonomy, q.risk, q.value].filter(Boolean).length;
  return (
    <>
      <PageHeader title="Work" description="Your recurring work, and ideas to automate it." actions={actions} />
      <WorkTabs active="processes" />
      {!q.status && (toReview || candidates) ? (
        <nav aria-label="Which processes" className="mb-3 flex flex-wrap gap-2 text-sm">
          {(
            [
              ["review", `Needs review (${toReview})`, toReview > 0],
              ["all", `Inventory (${inventory})`, true],
              ["candidates", `Candidates (${candidates})`, candidates > 0],
            ] as const
          )
            .filter(([, , show]) => show)
            .map(([key, label]) => (
              <Link
                key={key}
                href={`/processes?view=${key}`}
                aria-current={view === key ? "page" : undefined}
                className={`rounded-full border px-3 py-1 ${view === key ? "border-primary bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </Link>
            ))}
        </nav>
      ) : null}
      {view === "candidates" ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Signs of work that AutonomOS could not describe well enough yet: low confidence, no workflow or no numbers. They stay out of your metrics and ideas until you fill them in, or archive them.
        </p>
      ) : null}
      {q.drafted ? (
        <Alert variant="agent" className="mb-4">
          <Sparkles />
          <AlertTitle>
            AutonomOS drafted {q.drafted} process{q.drafted === "1" ? "" : "es"} for you
          </AlertTitle>
          <AlertDescription>
            From what AutonomOS read on your website and in your connected systems. Open each one, correct anything that is off, and approve it. Approving finds its automation opportunities.
          </AlertDescription>
        </Alert>
      ) : null}
      <FilterBar
        className="mb-4"
        activeCount={active}
        clearHref="/processes"
        more={
          <>
            <NativeSelect name="sort" defaultValue={sort} aria-label="Sort" className="col-span-2 sm:col-span-1">
              {Object.entries(SORTS).map(([k, v]) => (
                <NativeSelectOption key={k} value={k}>
                  {v}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect name="department" defaultValue={q.department ?? ""} aria-label="Department">
              <NativeSelectOption value="">All departments</NativeSelectOption>
              {(departments ?? []).map((d) => (
                <NativeSelectOption key={d.id} value={d.id}>
                  {d.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect name="status" defaultValue={q.status ?? ""} aria-label="Status">
              <NativeSelectOption value="">Any status</NativeSelectOption>
              {["candidate", "draft", "reviewed", "active", "archived"].map((s) => (
                <NativeSelectOption key={s} value={s}>
                  {s[0]!.toUpperCase() + s.slice(1)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect name="autonomy" defaultValue={q.autonomy ?? ""} aria-label="Autonomy">
              <NativeSelectOption value="">Any autonomy</NativeSelectOption>
              {[1, 2, 3, 4, 5].map((l) => (
                <NativeSelectOption key={l} value={l}>
                  L{l}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect name="risk" defaultValue={q.risk ?? ""} aria-label="Risk">
              <NativeSelectOption value="">Any risk</NativeSelectOption>
              <NativeSelectOption value="low">Low risk</NativeSelectOption>
              <NativeSelectOption value="medium">Medium risk</NativeSelectOption>
              <NativeSelectOption value="high">High risk</NativeSelectOption>
            </NativeSelect>
            <NativeSelect name="value" defaultValue={q.value ?? ""} aria-label="Business value">
              <NativeSelectOption value="">Any value</NativeSelectOption>
              <NativeSelectOption value="high">High value</NativeSelectOption>
              <NativeSelectOption value="low">Lower value</NativeSelectOption>
            </NativeSelect>
          </>
        }
      >
        {view === "review" || view === "all" || view === "candidates" ? <input type="hidden" name="view" value={view} /> : null}
        <Input name="q" placeholder="Search processes" defaultValue={q.q} aria-label="Search processes" className="flex-1 sm:max-w-72" />
      </FilterBar>
      <Card className="@container gap-0 overflow-hidden py-0 sm:py-0">
        <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 sm:[&_td:first-child]:pl-6 sm:[&_th:first-child]:pl-6">
          <TableHeader>
            <TableRow>
              <TableHead>Process</TableHead>
              <TableHead className="hidden @4xl:table-cell">Department</TableHead>
              <TableHead className="hidden @2xl:table-cell">Monthly time</TableHead>
              <TableHead className="hidden @2xl:table-cell">Autonomy</TableHead>
              <TableHead className="hidden @4xl:table-cell">Scores</TableHead>
              <TableHead className="text-right @lg:text-left">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((p) => {
              const dept = (p.departments as unknown as { name: string } | null)?.name;
              // No hours or scores for a process not yet described well enough to base them on.
              const held = estimateHeld({ ...p, stepsCount: embeddedCount(p.process_steps) });
              return (
                // The title link covers the whole row, so the row opens on a tap, click or Enter.
                <TableRow key={p.id} className="relative hover:bg-muted/50 focus-within:bg-muted/50">
                  <TableCell className="w-full max-w-0 whitespace-normal">
                    <Link
                      href={`/processes/${p.id}`}
                      title={p.title}
                      className="line-clamp-2 font-medium break-words outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:underline focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                    >
                      {p.title}
                    </Link>
                    <div className="mt-0.5 meta-dots flex flex-wrap gap-x-2 text-xs text-muted-foreground @2xl:hidden">
                      {held ? (
                        <span title={held}>Not estimated yet</span>
                      ) : (
                        <>
                          <span>{hours(monthly(p))} / month</span>
                          <LevelChange from={effective(p)} to={p.potential_autonomy_level} />
                        </>
                      )}
                    </div>
                    <div className="hidden text-xs text-muted-foreground @2xl:block @4xl:hidden">{dept}</div>
                    {(() => {
                      const gaps = processGaps(p);
                      return gaps.length ? (
                        // One short line per row; the full list is in the tooltip and on the process.
                        <Link
                          href={`/processes/${p.id}?edit=1#edit`}
                          title={`Missing: ${gaps.join("; ")}`}
                          aria-label={`${gaps.length} gap${gaps.length === 1 ? "" : "s"}: ${gaps.join("; ")}. Review`}
                          className="relative z-10 mt-0.5 inline-block text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {gaps.length} gap{gaps.length === 1 ? "" : "s"} · Review
                        </Link>
                      ) : null;
                    })()}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground @4xl:table-cell">
                    {dept ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className={`size-2 shrink-0 rounded-full ${TONE[toneFor(dept)].bar}`} />
                        {dept}
                      </span>
                    ) : (
                      "–"
                    )}
                  </TableCell>
                  <TableCell className="hidden tabular-nums @2xl:table-cell">
                    {held ? (
                      <span className="text-xs text-muted-foreground" title={held}>
                        Not estimated yet
                      </span>
                    ) : (
                      hours(monthly(p))
                    )}
                    <div className="text-xs text-muted-foreground">{FREQUENCY_LABEL[p.frequency]}</div>
                  </TableCell>
                  <TableCell className="hidden @2xl:table-cell">
                    <LevelChange from={effective(p)} to={p.potential_autonomy_level} />
                  </TableCell>
                  <TableCell className="hidden @4xl:table-cell">
                    {held ? <span className="text-xs text-muted-foreground">Not scored yet</span> : <Scores dense value={p.business_value} difficulty={p.automation_difficulty} risk={p.risk_level} />}
                  </TableCell>
                  <TableCell className="text-right @lg:text-left">
                    <StatusBadge status={p.status} />
                  </TableCell>
                </TableRow>
              );
            })}
            {!list.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No processes match these filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <span className="flex gap-2">
            {page > 1 ? (
              <ButtonLink href={pageHref(page - 1)} variant="outline" size="sm">
                Previous
              </ButtonLink>
            ) : null}
            {page < pages ? (
              <ButtonLink href={pageHref(page + 1)} variant="outline" size="sm">
                Next
              </ButtonLink>
            ) : null}
          </span>
        </nav>
      ) : null}
    </>
  );
}
