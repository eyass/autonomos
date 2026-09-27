import { Menu } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CONTACT_EMAIL } from "./config";
import { ButtonLink } from "@/components/app/button-link";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { Logo as BrandLogo } from "@/components/brand/logo";

export { CONTACT_EMAIL, SECURITY_EMAIL, SITE_URL } from "./config";

const NAV = [
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
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="ml-6 hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Sign in
          </ButtonLink>
          <ButtonLink href="/signup" size="sm">
            Start free
          </ButtonLink>
          {/* A native disclosure keeps the phone menu working without client JavaScript. */}
          <details className="group relative md:hidden">
            <summary className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md hover:bg-muted [&::-webkit-details-marker]:hidden" aria-label="Menu">
              <Menu size={18} />
            </summary>
            <nav aria-label="Mobile" className="absolute right-0 top-10 w-52 rounded-lg border border-border bg-card p-2 shadow-sm">
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

export function SiteFooter() {
  const links = [
    { href: "/security", label: "Security" },
    { href: "/docs", label: "Docs" },
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
  ];
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <Logo />
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">Find the recurring work, deploy constrained agents, measure how autonomous you are becoming.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-foreground">
              {l.label}
            </Link>
          ))}
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground">
            {CONTACT_EMAIL}
          </a>
        </nav>
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
    <div className="mb-8">
      {eyebrow ? (
        <p className="eyebrow flex items-center gap-2 text-highlight-strong">
          <span aria-hidden className="h-3 w-1 rounded-full bg-highlight" />
          {eyebrow}
        </p>
      ) : null}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {children ? <div className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">{children}</div> : null}
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
