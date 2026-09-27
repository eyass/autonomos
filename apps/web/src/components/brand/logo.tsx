import { cn } from "@/lib/utils";

// The AutonomOS mark: the autonomy scale itself. Five bars rise from L1 (people do the work)
// to L5 (the agent runs it), and the top level is lit in signal orange, the colour used for
// agent activity across the app. The same scale appears as LevelMeter wherever levels show.
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 shrink-0", className)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      {BARS.map((b, i) => (
        <rect key={i} x={b.x} y={24 - b.h} width="3" height={b.h} rx="1.5" fill={i === 4 ? "var(--highlight)" : "#fff"} opacity={i === 4 ? 1 : 0.4 + i * 0.18} />
      ))}
    </svg>
  );
}

const BARS = [
  { x: 6.5, h: 4 },
  { x: 10.5, h: 6.5 },
  { x: 14.5, h: 9 },
  { x: 18.5, h: 11.5 },
  { x: 22.5, h: 16 },
];

// "OS" is a small signal tag in the mono face: the operating layer the agents run on.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center font-display text-base font-semibold tracking-tight", className)}>
      Autonom
      <span className="ml-[3px] rounded-[4px] bg-highlight px-[3px] py-[2px] font-mono text-[max(0.64em,10px)] font-bold leading-none tracking-wide text-white">OS</span>
    </span>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={markClassName} />
      <Wordmark />
    </span>
  );
}

// An autonomy level drawn as the brand scale: `level` of five rising bars filled.
export function LevelMeter({ level, className, tone = "levels" }: { level: number; className?: string; tone?: "levels" | "signal" | "inverted" }) {
  return (
    <span className={cn("inline-flex h-4 items-end gap-[3px]", className)} aria-hidden>
      {[1, 2, 3, 4, 5].map((l) => {
        const on = l <= level;
        const color = !on
          ? tone === "inverted"
            ? "rgb(255 255 255 / 0.18)"
            : "var(--border)"
          : tone === "signal" || (tone === "inverted" && l === level)
            ? "var(--highlight)"
            : tone === "inverted"
              ? "#fff"
              : `var(--level-${l})`;
        return <span key={l} className="w-[4px] rounded-full" style={{ height: `${20 + l * 16}%`, background: color }} />;
      })}
    </span>
  );
}
