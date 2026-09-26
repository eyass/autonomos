import type { Metadata } from "next";
import Link from "next/link";
import { DOCS, type DocPage } from "./docs";
import { PageIntro, Prose } from "./site";

export function docMetadata(doc: DocPage): Metadata {
  const title = doc.slug ? `${doc.title} · Docs` : "Docs";
  return {
    title,
    description: doc.description,
    alternates: { canonical: doc.href },
    openGraph: { title: `${title} · AutonomOS`, description: doc.description, url: doc.href, type: "article" },
  };
}

export function DocArticle({ doc }: { doc: DocPage }) {
  const index = DOCS.indexOf(doc);
  const prev = DOCS[index - 1];
  const next = DOCS[index + 1];
  const Body = doc.body;
  return (
    <article>
      <PageIntro eyebrow="Docs" title={doc.title}>
        {doc.description}
      </PageIntro>
      <Prose>
        <Body />
      </Prose>
      <nav aria-label="Pagination" className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-sm sm:flex-row sm:justify-between">
        {prev ? (
          <Link href={prev.href} className="text-muted-foreground hover:text-foreground">
            Previous: {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={next.href} className="text-muted-foreground hover:text-foreground sm:text-right">
            Next: {next.title}
          </Link>
        ) : null}
      </nav>
    </article>
  );
}
