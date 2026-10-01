import { AUTONOMY_LEVELS } from "@autonomos/schemas";
import Link from "next/link";
import { LevelMeter, Logo } from "@/components/brand/logo";

// Form on the right; on wide screens the brand panel on the left shows the autonomy scale.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-ink p-10 text-ink-foreground lg:flex lg:flex-col">
        <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div aria-hidden className="bg-ink-glow pointer-events-none absolute inset-0" />
        <Link href="/" className="relative self-start" aria-label="AutonomOS home">
          <Logo markClassName="size-8" className="text-white" />
        </Link>
        {/* An approval as the app shows it: the moment the product is built around. */}
        <div aria-hidden className="relative my-auto flex justify-center py-10">
          <div className="w-full max-w-xs -rotate-2 rounded-2xl border border-white/10 bg-white p-4 text-foreground shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="signal-pulse size-2 rounded-full bg-highlight" /> Refund handling
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-strong">
                <LevelMeter level={3} className="h-3" /> Approve
              </span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Waiting for you · above the €50 limit</p>
            <p className="mt-0.5 font-display text-2xl font-semibold">€72.00 refund</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <span className="inline-flex h-8 items-center justify-center rounded-md border border-border text-xs font-medium">Reject</span>
              <span className="inline-flex h-8 items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground">Approve</span>
            </div>
          </div>
        </div>
        <div className="relative max-w-sm">
          <p className="text-3xl font-semibold leading-tight tracking-[-0.02em]">Agents you can trust with real actions.</p>
          <p className="mt-3 text-sm text-white/65">Every agent runs in a clear mode. You hand over more when its record earns it.</p>
          <ol className="mt-8 space-y-2.5">
            {AUTONOMY_LEVELS.map((l, i) => (
              <li key={l.code} className="flex items-center gap-3 text-xs text-white/70">
                <LevelMeter level={i + 1} tone="inverted" className="h-3" />
                <span className={i === 3 ? "w-14 font-bold text-highlight" : "w-14 font-bold text-white"}>{l.name}</span>
                <span>{l.short}</span>
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
