"use client";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const config = {
  baseline: { label: "Already on your software", color: "var(--chart-3)" },
  live: { label: "AutonomOS live", color: "var(--chart-1)" },
} satisfies ChartConfig;

const asPct = (v: number) => `${(v * 100).toFixed(1)}%`;

type Point = { period: string; baseline: number; live: number };

// Two stacked areas, so mapping more work (which moves the software share) is never mistaken
// for agents doing more. Screen readers get a summary and the numbers as a table.
export function AutonomyTrend({ data }: { data: Point[] }) {
  const first = data[0];
  const last = data.at(-1);
  const summary =
    first && last
      ? `AutonomOS live went from ${asPct(first.live)} in ${first.period} to ${asPct(last.live)} in ${last.period}. Mapped work already on your software went from ${asPct(first.baseline)} to ${asPct(last.baseline)}.`
      : "No history yet.";
  return (
    <figure>
      <figcaption className="sr-only">{summary}</figcaption>
      <table className="sr-only">
        <caption>Mapped work without people, by period</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Already on your software</th>
            <th scope="col">AutonomOS live</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.period}>
              <td>{d.period}</td>
              <td>{asPct(d.baseline)}</td>
              <td>{asPct(d.live)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ChartContainer config={config} className="aspect-auto h-52 w-full" aria-hidden="true">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tickLine={false} axisLine={false} width={48} domain={[0, (max: number) => Math.max(0.1, Math.ceil(max * 10) / 10)]} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" formatter={(v, name) => `${config[name as keyof typeof config]?.label ?? name}: ${asPct(Number(v))}`} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Area type="monotone" dataKey="baseline" stackId="a" stroke="var(--color-baseline)" strokeWidth={1.5} fill="var(--color-baseline)" fillOpacity={0.15} />
          <Area type="monotone" dataKey="live" stackId="a" stroke="var(--color-live)" strokeWidth={2} fill="var(--color-live)" fillOpacity={0.35} />
        </AreaChart>
      </ChartContainer>
    </figure>
  );
}
