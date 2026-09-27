import { AUTONOMY_LEVELS } from "@autonomos/schemas";
import Link from "next/link";
import { LevelMeter, Logo } from "@/components/brand/logo";

// Form on the right; on wide screens the brand panel on the left shows the autonomy scale.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-ink p-10 text-ink-foreground lg:flex lg:flex-col">
        <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-32 size-[30rem] rounded-full bg-highlight/15 blur-3xl" />
        <Link href="/" className="relative self-start" aria-label="AutonomOS home">
          <Logo markClassName="size-8" className="text-white" />
        </Link>
        <div className="relative mt-auto max-w-sm">
          <p className="text-3xl font-semibold leading-tight tracking-[-0.02em]">Agents you can trust with real actions.</p>
          <p className="mt-3 text-sm text-white/65">Every agent runs at an explicit level. You raise it when its record earns it.</p>
          <ol className="mt-8 space-y-2.5">
            {AUTONOMY_LEVELS.map((l, i) => (
              <li key={l.code} className="flex items-center gap-3 font-mono text-xs text-white/70">
                <LevelMeter level={i + 1} tone="inverted" className="h-3" />
                <span className={i === 4 ? "font-bold text-highlight" : "font-bold text-white"}>{l.code}</span>
                <span>{l.name}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
      <div className="flex flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Link href="/" className="self-center lg:hidden" aria-label="AutonomOS home">
            <Logo markClassName="size-7" />
          </Link>
          {children}
          <nav aria-label="Legal" className="flex justify-center gap-4 text-xs text-muted-foreground">
            <Link href="/security" className="hover:text-foreground">
              Security
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
