"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function AutonomyTrend({ data }: { data: Array<{ period: string; value: number }> }) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="autonomy" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} domain={[0, (max: number) => Math.max(0.1, Math.ceil(max * 10) / 10)]} />
          <Tooltip formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`, "Autonomy"]} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid var(--border)" }} />
          <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} fill="url(#autonomy)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
