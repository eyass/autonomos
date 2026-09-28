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
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow flex items-center gap-2 text-highlight-strong">
        <span aria-hidden className="h-3 w-1 rounded-full bg-highlight" />
        Solutions
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Agents for every team</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">Pick a team to see the workflows its agents run.</p>
      <div className="mt-10">
        <DepartmentCards />
      </div>
    </div>
  );
}
