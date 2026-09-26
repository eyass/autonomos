import { DOCS_ROUTES } from "@/components/marketing/docs";
import { DocsNav } from "@/components/marketing/docs-nav";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <DocsNav items={DOCS_ROUTES} />
      </aside>
      <div className="min-w-0 max-w-3xl">{children}</div>
    </div>
  );
}
