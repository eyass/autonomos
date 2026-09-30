import Link from "next/link";
import { Check } from "lucide-react";

// Earlier steps link back, so people can correct their company info after moving on.
const STEPS = [
  { label: "Your company", href: "/onboarding/about" },
  { label: "Connect systems", href: "/onboarding/connect" },
  { label: "Map processes", href: "/onboarding/mapping" },
];

export function Steps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="mb-8 grid grid-cols-3 gap-2 text-xs sm:text-[13px]" aria-label="Setup steps">
      {STEPS.map((s, i) => {
        const done = i < current;
        const label = (
          <span className="flex items-center gap-2">
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold ${
                done ? "bg-primary text-primary-foreground" : i === current ? "bg-highlight text-white ring-4 ring-highlight-soft" : "border border-border bg-card text-muted-foreground"
              }`}
            >
              {done ? <Check size={11} aria-hidden /> : i + 1}
            </span>
            <span className="truncate">{s.label}</span>
          </span>
        );
        return (
          <li
            key={s.label}
            aria-current={i === current ? "step" : undefined}
            className={`min-w-0 border-t-2 pt-3 ${i < current ? "border-primary" : i === current ? "border-highlight font-medium text-foreground" : "border-border text-muted-foreground"}`}
          >
            {done ? (
              <Link href={s.href} className="text-foreground hover:underline">
                {label}
              </Link>
            ) : (
              label
            )}
          </li>
        );
      })}
    </ol>
  );
}
