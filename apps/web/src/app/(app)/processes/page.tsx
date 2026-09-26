import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { LevelChange, Scores, StatusBadge } from "@/components/domain";
import { ButtonLink, Card, EmptyState, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { FREQUENCY_LABEL, hours } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

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
      .select("id, title, status, frequency, department_id, estimated_occurrences_per_month, estimated_minutes_per_occurrence, current_autonomy_level, potential_autonomy_level, business_value, automation_difficulty, risk_level, confidence, departments(name)")
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
      <ButtonLink href="/discover" variant="secondary">
        Discover processes
      </ButtonLink>
      <ButtonLink href="/processes/new">Add process</ButtonLink>
    </>
  );

  if (!rows?.length) {
    return (
      <>
        <PageHeader title="Processes" description="The recurring work your teams do today." actions={actions} />
        <EmptyState title="No processes yet." description="Describe how your team works and AutonomOS turns it into a structured inventory you can review." action={<ButtonLink href="/discover">Start AI discovery</ButtonLink>} />
      </>
    );
  }

  const active = [q.department, q.status, q.autonomy, q.risk, q.value].filter(Boolean).length;
  return (
    <>
      <PageHeader title="Processes" description="The recurring work your teams do today, and how autonomous it could become." actions={actions} />
      <FilterBar
        className="mb-4"
        activeCount={active}
        clearHref="/processes"
        more={
          <>
            <Select name="sort" defaultValue={sort} aria-label="Sort" className="col-span-2 sm:col-span-1">
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select name="department" defaultValue={q.department ?? ""} aria-label="Department">
              <option value="">All departments</option>
              {(departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select name="status" defaultValue={q.status ?? ""} aria-label="Status">
              <option value="">Any status</option>
              {["draft", "reviewed", "active", "archived"].map((s) => (
                <option key={s} value={s}>
                  {s[0]!.toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
            <Select name="autonomy" defaultValue={q.autonomy ?? ""} aria-label="Autonomy">
              <option value="">Any autonomy</option>
              {[1, 2, 3, 4, 5].map((l) => (
                <option key={l} value={l}>
                  L{l}
                </option>
              ))}
            </Select>
            <Select name="risk" defaultValue={q.risk ?? ""} aria-label="Risk">
              <option value="">Any risk</option>
              <option value="low">Low risk</option>
              <option value="medium">Medium risk</option>
              <option value="high">High risk</option>
            </Select>
            <Select name="value" defaultValue={q.value ?? ""} aria-label="Business value">
              <option value="">Any value</option>
              <option value="high">High value</option>
              <option value="low">Lower value</option>
            </Select>
          </>
        }
      >
        <Input name="q" placeholder="Search processes" defaultValue={q.q} aria-label="Search processes" className="flex-1 sm:max-w-72" />
      </FilterBar>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Process</Th>
              <Th className="hidden lg:table-cell">Department</Th>
              <Th className="hidden md:table-cell">Monthly time</Th>
              <Th className="hidden md:table-cell">Autonomy</Th>
              <Th className="hidden lg:table-cell">Scores</Th>
              <Th className="text-right sm:text-left">Status</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const dept = (p.departments as unknown as { name: string } | null)?.name;
              return (
                <tr key={p.id} className="hover:bg-surface-muted/50">
                  <Td>
                    <Link href={`/processes/${p.id}`} className="font-medium hover:underline">
                      {p.title}
                    </Link>
                    <div className="mt-0.5 meta-dots flex flex-wrap gap-x-2 text-xs text-muted md:hidden">
                      {dept ? <span>{dept}</span> : null}
                      <span>{hours(monthly(p))} / month</span>
                      <LevelChange from={effective(p)} to={p.potential_autonomy_level} />
                    </div>
                    <div className="hidden text-xs text-muted md:block lg:hidden">{dept}</div>
                    {p.confidence !== null && Number(p.confidence) < 0.6 ? <div className="text-xs text-warn">Low confidence, needs review</div> : null}
                  </Td>
                  <Td className="hidden text-muted lg:table-cell">{dept ?? "–"}</Td>
                  <Td className="hidden tabular-nums md:table-cell">
                    {hours(monthly(p))}
                    <div className="text-xs text-muted">{FREQUENCY_LABEL[p.frequency]}</div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <LevelChange from={effective(p)} to={p.potential_autonomy_level} />
                  </Td>
                  <Td className="hidden lg:table-cell">
                    <Scores value={p.business_value} difficulty={p.automation_difficulty} risk={p.risk_level} />
                  </Td>
                  <Td className="text-right sm:text-left">
                    <StatusBadge status={p.status} />
                  </Td>
                </tr>
              );
            })}
            {!list.length ? (
              <tr>
                <Td colSpan={6} className="py-8 text-center text-muted">
                  No processes match these filters.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
