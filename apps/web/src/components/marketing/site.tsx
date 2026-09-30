import { Menu } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CONTACT_EMAIL } from "./config";
import { ButtonLink } from "@/components/app/button-link";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { Logo as BrandLogo } from "@/components/brand/logo";
import { DEPARTMENTS } from "./departments";

export { CONTACT_EMAIL, SECURITY_EMAIL, SITE_URL } from "./config";

const NAV = [
  { href: "/solutions", label: "Solutions" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/security", label: "Security" },
  { href: "/docs", label: "Docs" },
  { href: "/#pricing", label: "Pricing" },
];

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center", className)} aria-label="AutonomOS home">
      <BrandLogo markClassName="size-7" />
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="mx-auto hidden items-center gap-1 text-sm text-muted-foreground md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 transition-colors hover:bg-muted hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Sign in
          </ButtonLink>
          <ButtonLink href="/signup" size="sm" className="px-3.5">
            Start free
          </ButtonLink>
          {/* A native disclosure keeps the phone menu working without client JavaScript. */}
          <details className="group relative md:hidden">
            <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md hover:bg-muted [&::-webkit-details-marker]:hidden" aria-label="Menu">
              <Menu size={18} />
            </summary>
            <nav aria-label="Mobile" className="absolute right-0 top-11 w-56 rounded-xl border border-border bg-card p-2 shadow-lg">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-md px-3 py-2 text-sm hover:bg-muted">
                  {n.label}
                </Link>
              ))}
              <Link href="/login" className="block rounded-md px-3 py-2 text-sm hover:bg-muted">
                Sign in
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

const FOOTER = [
  {
    title: "Product",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#control", label: "Control" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/signup", label: "Start free" },
    ],
  },
  {
    title: "Solutions",
    links: DEPARTMENTS.map((d) => ({ href: `/solutions/${d.slug}`, label: d.name })),
  },
  {
    title: "Resources",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/docs/autonomy-levels", label: "Autonomy levels" },
      { href: "/security", label: "Security" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: `mailto:${CONTACT_EMAIL}`, label: "Contact" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">Agents for the recurring work, inside your limits.</p>
        </div>
        {FOOTER.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="eyebrow text-muted-foreground">{col.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map((l) => (
                <li key={l.href}>
                  {l.href.startsWith("mailto:") ? (
                    <a href={l.href} className="text-foreground/80 hover:text-foreground">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-foreground/80 hover:text-foreground">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} AutonomOS</span>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground">
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}

// Shared typography for long-form pages (security, docs, legal).
export function Prose({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "min-w-0 break-words text-sm leading-6 text-foreground/90 sm:text-[15px] sm:leading-7",
        "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground",
        "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground",
        "[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5",
        "[&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_code]:break-all",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageIntro({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-10 border-b border-border pb-8">
      {eyebrow ? (
        <p className="eyebrow flex items-center gap-2 text-highlight-strong">
          <span aria-hidden className="h-3 w-1 rounded-full bg-highlight" />
          {eyebrow}
        </p>
      ) : null}
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-[2.75rem] sm:leading-[1.08]">{title}</h1>
      {children ? <div className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">{children}</div> : null}
    </div>
  );
}

export function DraftNotice() {
  return (
    <div role="note" className="mb-8 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
      <strong className="font-semibold">Draft, to be reviewed by counsel.</strong> This text is a plain-language draft and is not yet final.
    </div>
  );
}

export const SUBPROCESSORS = [
  { name: "Vercel", purpose: "Hosting of the web application", when: "Always" },
  { name: "Supabase", purpose: "Database and authentication, sends authentication emails", when: "Always" },
  { name: "Trigger.dev", purpose: "Durable execution of agent runs", when: "When agents run" },
  { name: "Google", purpose: "Gemini models (default model provider)", when: "Default" },
  { name: "Anthropic", purpose: "Claude models", when: "Only if selected" },
  { name: "OpenAI", purpose: "GPT models", when: "Only if selected" },
  { name: "Composio", purpose: "OAuth connections to live accounts", when: "Only for live integrations" },
  { name: "PostHog", purpose: "Product analytics", when: "When enabled" },
];

export function SubprocessorTable() {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-left text-sm">
        <TableHeader>
          <TableRow className="border-b border-border text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium sm:px-4">Subprocessor</th>
            <th className="px-3 py-2 font-medium sm:px-4">Purpose</th>
            <th className="px-3 py-2 font-medium sm:px-4">Used</th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SUBPROCESSORS.map((s) => (
            <TableRow key={s.name} className="border-b border-border last:border-0 align-top">
              <td className="px-3 py-2.5 font-medium sm:px-4">{s.name}</td>
              <td className="px-3 py-2.5 text-muted-foreground sm:px-4">{s.purpose}</td>
              <td className="px-3 py-2.5 text-muted-foreground sm:px-4">{s.when}</td>
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
  );
}

// One retention statement for the Security and Privacy pages, so the two can never disagree.
export function RetentionList() {
  return (
    <ul>
      <li>Run history, tool inputs and outputs, and audit events are kept for the life of the workspace.</li>
      <li>
        Samples read from connected systems to discover processes are redacted, and deleted as soon as the suggestions are drafted. The discovery run keeps only per-system counts and the suggestions.
      </li>
      <li>AutonomOS reads at most six public pages of your website each time it drafts or refreshes your company profile, and keeps the profile it drafted, not the pages.</li>
      <li>
        An owner can delete a workspace in Settings, under Danger zone. That deletes its processes, agents, runs, connections and audit history. Copies in our database provider&apos;s backups are
        removed when those backups expire.
      </li>
      <li>
        To delete your own account, or for anything this does not cover, <a href={`mailto:${CONTACT_EMAIL}?subject=Delete%20my%20data`}>contact us</a>.
      </li>
    </ul>
  );
}
