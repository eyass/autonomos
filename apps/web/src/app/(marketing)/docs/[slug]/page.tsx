import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocArticle, docMetadata } from "@/components/marketing/doc-article";
import { DOCS } from "@/components/marketing/docs";

export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS.filter((d) => d.slug).map((d) => ({ slug: d.slug }));
}

const find = (slug: string) => DOCS.find((d) => d.slug && d.slug === slug);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const doc = find((await params).slug);
  return doc ? docMetadata(doc) : {};
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const doc = find((await params).slug);
  if (!doc) notFound();
  return <DocArticle doc={doc} />;
}
