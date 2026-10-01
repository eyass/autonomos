import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/app/button-link";
import { LevelMeter } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

// What a signed-out visitor sees at an address that does not exist (the proxy rewrites unknown
// public paths here with a 404), inside the public site rather than at a sign-in form.
const LINKS = [
  { href: "/solutions", label: "Solutions", body: "Agents for every team" },
  { href: "/docs", label: "Docs", body: "How AutonomOS works" },
  { href: "/security", label: "Security", body: "How agents are kept in bounds" },
];

export default function PublicNotFound() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6 sm:py-28">
      <LevelMeter level={1} className="mx-auto h-8" />
      <p className="eyebrow mt-6 text-highlight-strong">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">This page does not exist</h1>
      <p className="mx-auto mt-4 max-w-md text-muted-foreground">The address may be mistyped, or the page has moved. These are good places to go instead.</p>
      <ul className="mt-10 grid gap-3 text-left sm:grid-cols-3">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="group flex h-full flex-col rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex items-center justify-between font-display font-semibold">
                {l.label}
                <ArrowRight size={14} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 text-sm text-muted-foreground">{l.body}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
        <ButtonLink href="/" size="lg">
          Go to the home page
        </ButtonLink>
        <ButtonLink href="/login" size="lg" variant="outline">
          Sign in
        </ButtonLink>
      </div>
    </section>
  );
}
