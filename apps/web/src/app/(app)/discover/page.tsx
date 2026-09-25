import { DEPARTMENTS } from "@autonomos/schemas";
import Link from "next/link";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/session";
import { DocumentImport } from "./document-import";
import { Interview } from "./interview";

export const metadata = { title: "Discover processes" };

const FIRST_RUN = [
  "Create or import your first processes",
  "Review the AI-generated processes",
  "Generate automation opportunities",
  "Select one opportunity",
  "Create an agent",
  "Run the agent in test mode",
  "Activate it, or leave it in draft",
];

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ welcome?: string; tab?: string }> }) {
  const session = await requireSession();
  const { welcome, tab } = await searchParams;
  const departments = session.org.improvementAreas.length ? session.org.improvementAreas : [...DEPARTMENTS];
  return (
    <>
      <PageHeader title="Discover processes" description="Map the recurring work in your company. Everything discovered starts as a draft for you to review." />
      {welcome ? (
        <Card className="mb-6 border-accent/40">
          <CardBody>
            <div className="mb-2 text-sm font-semibold">Welcome to AutonomOS. Here is the path to your first agent:</div>
            <ol className="grid gap-1 text-sm text-muted sm:grid-cols-2">
              {FIRST_RUN.map((s, i) => (
                <li key={s}>
                  {i + 1}. {s}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      ) : null}
      <div className="mb-4 flex gap-4 border-b border-border text-sm">
        <Link href="/discover" className={`-mb-px border-b-2 px-1 pb-2 ${tab !== "document" ? "border-accent font-medium" : "border-transparent text-muted"}`}>
          Guided interview
        </Link>
        <Link href="/discover?tab=document" className={`-mb-px border-b-2 px-1 pb-2 ${tab === "document" ? "border-accent font-medium" : "border-transparent text-muted"}`}>
          Import a document
        </Link>
        <Link href="/processes/new" className="-mb-px border-b-2 border-transparent px-1 pb-2 text-muted">
          Add manually
        </Link>
      </div>
      {tab === "document" ? <DocumentImport /> : <Interview departments={departments} />}
    </>
  );
}
