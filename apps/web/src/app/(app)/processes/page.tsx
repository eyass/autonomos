import Link from "next/link";
import { AutonomyLadder, ScorePill, StatusBadge } from "@/components/domain";
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
  const [{ data: departments }, { data: rows }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("organization_id", session.org.id).is("archived_at", null).order("name"),
    supabase
      .from("processes")
      .select("id, title, status, frequency, department_id, estimated_occurrences_per_month, estimated_minutes_per_occurrence, current_autonomy_level, potential_autonomy_level, business_value, automation_difficulty, risk_level, confidence, departments(name)")
      .eq("organization_id", session.org.id),
  ]);

  const monthly = (p: { estimated_occurrences_per_month: number | null; estimated_minutes_per_occurrence: number | null }) =>
    Number(p.estimated_occurrences_per_month ?? 0) * Number(p.estimated_minutes_per_occurrence ?? 0);
  let list = (rows ?? []).filter((p) => (q.status ? p.status === q.status : p.status !== "archived"));
  if (q.department) list = list.filter((p) => p.department_id === q.department);
  if (q.autonomy) list = list.filter((p) => String(p.current_autonomy_level) === q.autonomy);
  if (q.risk) list = list.filter((p) => (q.risk === "high" ? p.risk_level >= 4 : q.risk === "low" ? p.risk_level <= 2 : p.risk_level === 3));
  if (q.value) list = list.filter((p) => (q.value === "high" ? p.business_value >= 4 : p.business_value <= 3));
  if (q.q) list = list.filter((p) => p.title.toLowerCase().includes(q.q!.toLowerCase()));
  const sort = (q.sort ?? "potential") as keyof typeof SORTS;
  list.sort((a, b) => {
    if (sort === "time") return monthly(b) - monthly(a);
    if (sort === "value") return b.business_value - a.business_value;
    if (sort === "difficulty") return a.automation_difficulty - b.automation_difficulty;
    return b.potential_autonomy_level - b.current_autonomy_level - (a.potential_autonomy_level - a.current_autonomy_level) || monthly(b) - monthly(a);
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

  return (
    <>
      <PageHeader title="Processes" description="The recurring work your teams do today, with its autonomy now and what it could be." actions={actions} />
      <Card>
        <form className="flex flex-wrap items-end gap-2 border-b border-border p-3" method="get">
          <Input name="q" placeholder="Search processes" defaultValue={q.q} className="w-48" />
          <Select name="department" defaultValue={q.department ?? ""} className="w-40">
            <option value="">All departments</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={q.status ?? ""} className="w-32">
            <option value="">Any status</option>
            {["draft", "reviewed", "active", "archived"].map((s) => (
              <option key={s} value={s}>
                {s[0]!.toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
          <Select name="autonomy" defaultValue={q.autonomy ?? ""} className="w-32">
            <option value="">Any autonomy</option>
            {[1, 2, 3, 4, 5].map((l) => (
              <option key={l} value={l}>
                L{l}
              </option>
            ))}
          </Select>
          <Select name="risk" defaultValue={q.risk ?? ""} className="w-28">
            <option value="">Any risk</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
          <Select name="value" defaultValue={q.value ?? ""} className="w-28">
            <option value="">Any value</option>
            <option value="high">High</option>
            <option value="low">Lower</option>
          </Select>
          <Select name="sort" defaultValue={sort} className="w-56">
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <button className="h-9 rounded-md border border-border px-3 text-sm hover:bg-surface-muted" type="submit">
            Apply
          </button>
        </form>
        <Table>
          <thead>
            <tr>
              <Th>Process</Th>
              <Th>Department</Th>
              <Th>Status</Th>
              <Th>Frequency</Th>
              <Th>Monthly time</Th>
              <Th>Current autonomy</Th>
              <Th>Potential</Th>
              <Th>Value</Th>
              <Th>Difficulty</Th>
              <Th>Risk</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="hover:bg-surface-muted/50">
                <Td>
                  <Link href={`/processes/${p.id}`} className="font-medium hover:underline">
                    {p.title}
                  </Link>
                  {p.confidence !== null && Number(p.confidence) < 0.6 ? <div className="text-xs text-warn">Low confidence, needs review</div> : null}
                </Td>
                <Td className="text-muted">{(p.departments as unknown as { name: string } | null)?.name ?? "–"}</Td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
                <Td>{FREQUENCY_LABEL[p.frequency]}</Td>
                <Td className="tabular-nums">{hours(monthly(p))}</Td>
                <Td>
                  <AutonomyLadder current={p.current_autonomy_level} size="sm" />
                </Td>
                <Td className="font-medium">L{p.potential_autonomy_level}</Td>
                <Td>
                  <ScorePill kind="value" value={p.business_value} />
                </Td>
                <Td>
                  <ScorePill kind="difficulty" value={p.automation_difficulty} />
                </Td>
                <Td>
                  <ScorePill kind="risk" value={p.risk_level} />
                </Td>
              </tr>
            ))}
            {!list.length ? (
              <tr>
                <Td colSpan={10} className="py-8 text-center text-muted">
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
