// What a process still needs before its numbers can be trusted, in words people can act
// on. Used as a checklist on the process and as a hint in the process list.
export function processGaps(p: {
  department_id: string | null;
  estimated_occurrences_per_month: number | string | null;
  estimated_minutes_per_occurrence: number | string | null;
  stepsCount?: number;
  systemsCount?: number;
  missing_information?: string[] | null;
}): string[] {
  const gaps: string[] = [];
  if (!p.estimated_occurrences_per_month) gaps.push("How often it happens");
  if (!p.estimated_minutes_per_occurrence) gaps.push("How long it takes each time");
  if (!p.department_id) gaps.push("Which team does it");
  if (p.stepsCount === 0) gaps.push("The steps");
  if (p.systemsCount === 0) gaps.push("The systems it uses");
  for (const m of p.missing_information ?? []) if (gaps.length < 6) gaps.push(m);
  return gaps;
}
