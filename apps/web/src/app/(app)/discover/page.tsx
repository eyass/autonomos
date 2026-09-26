import { DEPARTMENTS } from "@autonomos/schemas";
import { ActionButton } from "@/components/action-button";
import { Card, CardBody, CardHeader, PageHeader, Tabs } from "@/components/ui";
import { requireSession } from "@/lib/session";
import { discoverFromIntegrationsAction } from "./actions";
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
        <Card className="mb-4 border-accent/40">
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
      <Tabs
        items={[
          { href: "/discover", label: "Interview", active: tab !== "document" && tab !== "integrations" },
          { href: "/discover?tab=document", label: "Document", active: tab === "document" },
          { href: "/discover?tab=integrations", label: "Connected systems", active: tab === "integrations" },
          { href: "/processes/new", label: "Add manually", active: false },
        ]}
      />
      {tab === "document" ? (
        <DocumentImport />
      ) : tab === "integrations" ? (
        <Card>
          <CardHeader
            title="Discover from connected systems"
            description="Samples ticket categories, representative tickets and refund activity from connected systems as supporting evidence. It does not observe everything your company does."
          />
          <CardBody>
            <ActionButton action={discoverFromIntegrationsAction} pendingLabel="Analysing…">
              Analyse connected systems
            </ActionButton>
          </CardBody>
        </Card>
      ) : (
        <Interview departments={departments} />
      )}
    </>
  );
}
