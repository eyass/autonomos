"use client";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const config = { value: { label: "Autonomy", color: "var(--chart-1)" } } satisfies ChartConfig;

// shadcn area chart (the "Area Chart - Gradient" pattern).
export function AutonomyTrend({ data }: { data: Array<{ period: string; value: number }> }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-48 w-full">
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
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" formatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} />} />
        <Area type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} fill="url(#fillAutonomy)" />
      </AreaChart>
    </ChartContainer>
  );
}
