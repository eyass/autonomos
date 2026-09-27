"use client";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const config = { value: { label: "Autonomy", color: "var(--chart-1)" } } satisfies ChartConfig;

const asPct = (v: number) => `${(v * 100).toFixed(1)}%`;

// shadcn area chart (the "Area Chart - Gradient" pattern). Screen readers get a one-line
// summary and the numbers as a table; the chart itself is decorative to them.
export function AutonomyTrend({ data }: { data: Array<{ period: string; value: number }> }) {
  const first = data[0];
  const last = data.at(-1);
  const change = first && last ? (last.value - first.value) * 100 : 0;
  const summary =
    first && last
      ? `Company autonomy went from ${asPct(first.value)} in ${first.period} to ${asPct(last.value)} in ${last.period}, ${change === 0 ? "no change" : `${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)} points`}.`
      : "No autonomy history yet.";
  return (
    <figure>
      <figcaption className="sr-only">{summary}</figcaption>
      <table className="sr-only">
        <caption>Company autonomy by period</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Autonomy</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.period}>
              <td>{d.period}</td>
              <td>{asPct(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ChartContainer config={config} className="aspect-auto h-48 w-full" aria-hidden="true">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="fillAutonomy" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tickLine={false} axisLine={false} width={48} domain={[0, (max: number) => Math.max(0.1, Math.ceil(max * 10) / 10)]} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" formatter={(v) => asPct(Number(v))} />} />
          <Area type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} fill="url(#fillAutonomy)" />
        </AreaChart>
      </ChartContainer>
    </figure>
  );
}
