"use client";
import { useRouter } from "next/navigation";
import { CartesianGrid, ReferenceArea, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";

const config = { hours: { label: "Hours saved / month", color: "var(--chart-1)" } } satisfies ChartConfig;

type Point = { id: string; title: string; value: number; difficulty: number; hours: number; risk: number };

// X: difficulty, Y: business value, bubble size: estimated monthly hours (PRD section 28).
export function OpportunityMatrix({ points }: { points: Point[] }) {
  const router = useRouter();
  // Spread identical coordinates slightly so bubbles do not hide each other.
  const seen = new Map<string, number>();
  const data = points.map((p) => {
    const key = `${p.difficulty}:${p.value}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return { ...p, x: p.difficulty + n * 0.12, y: p.value + n * 0.08, z: Math.max(p.hours, 1) };
  });
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full sm:h-80">
      <ScatterChart margin={{ top: 12, right: 12, bottom: 24, left: 0 }}>
        <ReferenceArea x1={0.5} x2={3} y1={3} y2={5.5} fill="var(--primary)" fillOpacity={0.07} label={{ value: "Quick wins", position: "insideTopLeft", fill: "var(--primary)", fontSize: 11 }} />
        <CartesianGrid stroke="var(--border)" />
        <XAxis
          type="number"
          dataKey="x"
          domain={[0.5, 5.5]}
          ticks={[1, 2, 3, 4, 5]}
          name="Difficulty"
          label={{ value: "Difficulty", position: "bottom", offset: 4, fontSize: 12, fill: "var(--muted-foreground)" }}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          type="number"
          dataKey="y"
          domain={[0.5, 5.5]}
          ticks={[1, 2, 3, 4, 5]}
          name="Business value"
          label={{ value: "Business value", angle: -90, position: "insideLeft", fontSize: 12, fill: "var(--muted-foreground)" }}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <ZAxis type="number" dataKey="z" range={[80, 900]} name="Hours / month" />
        <ChartTooltip
          cursor={false}
          content={({ payload }) => {
            const p = payload?.[0]?.payload as (Point & { z: number }) | undefined;
            if (!p) return null;
            return (
              <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                <div className="font-medium">{p.title}</div>
                <div className="text-muted-foreground">
                  Value {p.value}/5 · Difficulty {p.difficulty}/5 · Risk {p.risk}/5
                </div>
                <div className="text-muted-foreground">~{Math.round(p.hours)} h saved / month</div>
              </div>
            );
          }}
        />
        <Scatter data={data} fill="var(--color-hours)" fillOpacity={0.75} onClick={(d) => router.push(`/opportunities/${(d as unknown as Point).id}`)} className="cursor-pointer" />
      </ScatterChart>
    </ChartContainer>
  );
}
