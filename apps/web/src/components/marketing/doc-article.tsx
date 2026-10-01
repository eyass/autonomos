import { OG_IMAGES } from "./config";
import type { Metadata } from "next";
import Link from "next/link";
import { DOCS, type DocPage } from "./docs";
import { PageIntro, Prose } from "./site";
import { OnThisPage } from "./on-this-page";

export function docMetadata(doc: DocPage): Metadata {
  const title = doc.slug ? `${doc.title} · Docs` : "Docs";
  return {
    title,
    description: doc.description,
    alternates: { canonical: doc.href },
    openGraph: { title: `${title} · AutonomOS`, description: doc.description, url: doc.href, type: "article", images: OG_IMAGES },
  };
}

export function DocArticle({ doc }: { doc: DocPage }) {
  const index = DOCS.indexOf(doc);
  const prev = DOCS[index - 1];
  const next = DOCS[index + 1];
  const Body = doc.body;
  return (
    <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_12rem]">
      <article className="min-w-0 max-w-3xl">
        <PageIntro eyebrow="Docs" title={doc.title}>
          {doc.description}
        </PageIntro>
        <Prose data-toc>
          <Body />
        </Prose>
        <nav aria-label="Pagination" className="mt-12 grid gap-3 border-t border-border pt-6 text-sm sm:grid-cols-2">
          {prev ? (
            <Link href={prev.href} className="group rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40">
              <span className="eyebrow text-muted-foreground">Previous</span>
              <span className="mt-1 block font-medium group-hover:text-primary">{prev.title}</span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next ? (
            <Link href={next.href} className="group rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 sm:text-right">
              <span className="eyebrow text-muted-foreground">Next</span>
              <span className="mt-1 block font-medium group-hover:text-primary">{next.title}</span>
            </Link>
          ) : null}
        </nav>
      </article>
      <OnThisPage key={doc.href} />
    </div>
  );
}
