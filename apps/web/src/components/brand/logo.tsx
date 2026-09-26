import { cn } from "@/lib/utils";

// The AutonomOS mark: a teal tile with an open "A" (the work) and an orange signal dot (the
// agent doing it). The dot is the same orange used for agent activity across the app.
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 shrink-0", className)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <path d="M8.5 23.5 15 8.5h2l6.5 15" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.6 18h8.8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity="0.55" />
      <circle cx="24.5" cy="8.5" r="3.2" fill="var(--highlight)" stroke="var(--brand)" strokeWidth="1.4" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-base font-semibold tracking-tight", className)}>
      Autonom<span className="text-highlight">OS</span>
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
