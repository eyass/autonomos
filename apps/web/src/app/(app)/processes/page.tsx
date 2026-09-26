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
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Processes" };

const SORTS = {
  potential: "Highest automation potential",
  time: "Highest time consumption",
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
        "id, title, status, frequency, department_id, estimated_occurrences_per_month, estimated_minutes_per_occurrence, current_autonomy_level, potential_autonomy_level, business_value, automation_difficulty, risk_level, confidence, departments(name)",
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
  let list = (rows ?? []).filter((p) => (q.status ? p.status === q.status : p.status !== "archived"));
  if (q.department) list = list.filter((p) => p.department_id === q.department);
  if (q.autonomy) list = list.filter((p) => String(effective(p)) === q.autonomy);
  if (q.risk) list = list.filter((p) => (q.risk === "high" ? p.risk_level >= 4 : q.risk === "low" ? p.risk_level <= 2 : p.risk_level === 3));
  if (q.value) list = list.filter((p) => (q.value === "high" ? p.business_value >= 4 : p.business_value <= 3));
  if (q.q) list = list.filter((p) => p.title.toLowerCase().includes(q.q!.toLowerCase()));
  const sort = (q.sort ?? "potential") as keyof typeof SORTS;
  list.sort((a, b) => {
    if (sort === "time") return monthly(b) - monthly(a);
    if (sort === "value") return b.business_value - a.business_value;
    if (sort === "difficulty") return a.automation_difficulty - b.automation_difficulty;
    return b.potential_autonomy_level - effective(b) - (a.potential_autonomy_level - effective(a)) || monthly(b) - monthly(a);
  });

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
        <PageHeader title="Processes" description="The recurring work your teams do today." actions={actions} />
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
      <PageHeader title="Processes" description="The recurring work your teams do today, and how autonomous it could become." actions={actions} />
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
              {["draft", "reviewed", "active", "archived"].map((s) => (
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
        <Input name="q" placeholder="Search processes" defaultValue={q.q} aria-label="Search processes" className="flex-1 sm:max-w-72" />
      </FilterBar>
      <Card className="gap-0 overflow-hidden py-0 sm:py-0">
        <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 sm:[&_td:first-child]:pl-6 sm:[&_th:first-child]:pl-6">
          <TableHeader>
            <TableRow>
              <TableHead>Process</TableHead>
              <TableHead className="hidden lg:table-cell">Department</TableHead>
              <TableHead className="hidden md:table-cell">Monthly time</TableHead>
              <TableHead className="hidden md:table-cell">Autonomy</TableHead>
              <TableHead className="hidden lg:table-cell">Scores</TableHead>
              <TableHead className="text-right sm:text-left">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((p) => {
              const dept = (p.departments as unknown as { name: string } | null)?.name;
              return (
                <TableRow key={p.id} className="hover:bg-muted/50">
                  <TableCell>
                    <Link href={`/processes/${p.id}`} className="font-medium hover:underline">
                      {p.title}
                    </Link>
                    <div className="mt-0.5 meta-dots flex flex-wrap gap-x-2 text-xs text-muted-foreground md:hidden">
                      <span>{hours(monthly(p))} / month</span>
                      <LevelChange from={effective(p)} to={p.potential_autonomy_level} />
                    </div>
                    <div className="hidden text-xs text-muted-foreground md:block lg:hidden">{dept}</div>
                    {p.confidence !== null && Number(p.confidence) < 0.6 ? <div className="text-xs text-warning">Low confidence, needs review</div> : null}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{dept ?? "–"}</TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">
                    {hours(monthly(p))}
                    <div className="text-xs text-muted-foreground">{FREQUENCY_LABEL[p.frequency]}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <LevelChange from={effective(p)} to={p.potential_autonomy_level} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Scores value={p.business_value} difficulty={p.automation_difficulty} risk={p.risk_level} />
                  </TableCell>
                  <TableCell className="text-right sm:text-left">
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
    </>
  );
}
