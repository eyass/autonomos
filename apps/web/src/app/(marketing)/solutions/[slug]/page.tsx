import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OG_IMAGES } from "@/components/marketing/config";
import { DEPARTMENTS, departmentBySlug } from "@/components/marketing/departments";
import { DepartmentPage } from "@/components/marketing/solutions";

export const dynamicParams = false;

export function generateStaticParams() {
  return DEPARTMENTS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = departmentBySlug((await params).slug);
  if (!d) return {};
  const title = `AI agents for ${d.name.toLowerCase()} · AutonomOS`;
  return {
    title: { absolute: title },
    description: `${d.headline} ${d.sub}`,
    alternates: { canonical: `/solutions/${d.slug}` },
    openGraph: { title, description: d.headline, url: `/solutions/${d.slug}`, type: "website", images: OG_IMAGES },
  };
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = departmentBySlug((await params).slug);
  if (!d) notFound();
  return <DepartmentPage d={d} />;
}
