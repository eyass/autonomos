import Link from "next/link";

// Earlier steps link back, so people can correct their company info after moving on.
const STEPS = [
  { label: "Your company", href: "/onboarding/about" },
  { label: "Connect systems", href: "/onboarding/connect" },
  { label: "Map processes", href: "/onboarding/mapping" },
];

export function Steps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="mb-6 flex gap-2 text-xs">
      {STEPS.map((s, i) => (
        <li key={s.label} className={`flex-1 border-t-2 pt-2 ${i <= current ? "border-primary text-foreground" : "border-border text-muted-foreground"}`}>
          {i < current ? (
            <Link href={s.href} className="hover:underline">
              {i + 1}. {s.label}
            </Link>
          ) : (
            <>
              {i + 1}. {s.label}
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
