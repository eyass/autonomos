import type { Metadata } from "next";
import { OG_IMAGES } from "@/components/marketing/config";
import { DepartmentCards } from "@/components/marketing/solutions";

const title = "AI agents for every team · AutonomOS";

export const metadata: Metadata = {
  title: { absolute: title },
  description: "Agents that chain the tools each team already uses, inside limits you set.",
  alternates: { canonical: "/solutions" },
  openGraph: { title, url: "/solutions", type: "website", images: OG_IMAGES },
};

export default function SolutionsPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-ink text-ink-foreground">
        <div aria-hidden className="bg-ink-glow pointer-events-none absolute inset-0" />
        <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_0%,black,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <p className="eyebrow flex items-center justify-center gap-2 text-highlight">
            <span aria-hidden className="h-3 w-1 rounded-full bg-highlight" />
            Solutions
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.035em] sm:text-6xl sm:leading-[1.04]">Agents for every team</h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/70 sm:text-lg">Pick a team to see the workflows its agents run, and the tools they chain together.</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <DepartmentCards />
      </section>
    </>
  );
}
