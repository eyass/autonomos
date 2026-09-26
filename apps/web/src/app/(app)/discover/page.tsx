import { DEPARTMENTS } from "@autonomos/schemas";
import { adminDb, requireSession } from "@/lib/session";
import { latestDiscoveryRun } from "@/server/system-discovery";
import { ButtonLink } from "@/components/app/button-link";
import { DocumentImport } from "./document-import";
import { Interview } from "./interview";
import { SystemDiscovery } from "./system-discovery";
import { LinkTabs } from "@/components/app/link-tabs";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  const [latest, { count }] = await Promise.all([
    latestDiscoveryRun(session),
    adminDb().from("integration_connections").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id).eq("status", "connected"),
  ]);
  const connected = (count ?? 0) > 0;
  // A result from the last day is shown as is; otherwise the page reads the systems again.
  const fresh = latest?.status === "ready" && latest.recent;
  return (
    <>
      <PageHeader title="Discover processes" description="AutonomOS reads your connected systems and proposes the recurring work it finds. Everything starts as a draft for you to review." />
      {welcome ? (
        <Card className="mb-4 border-primary/40">
          <CardContent>
            <div className="mb-2 text-sm font-semibold">Welcome to AutonomOS. Here is the path to your first agent:</div>
            <ol className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
              {FIRST_RUN.map((s, i) => (
                <li key={s}>
                  {i + 1}. {s}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
      <LinkTabs
        items={[
          { href: "/discover", label: "From your systems", active: !tab || tab === "integrations" },
          { href: "/discover?tab=interview", label: "Interview", active: tab === "interview" },
          { href: "/discover?tab=document", label: "Document", active: tab === "document" },
          { href: "/processes/new", label: "Add manually", active: false },
        ]}
      />
      {tab === "document" ? (
        <DocumentImport />
      ) : tab === "interview" ? (
        <Interview departments={departments} defaultDepartment={latest?.status === "ready" ? latest.proposals[0]?.department : undefined} />
      ) : connected ? (
        <SystemDiscovery initialRun={latest} autoStart={!fresh} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Connect a system and AutonomOS finds the work for you</CardTitle>
            <CardDescription>
              Once Gmail, Zendesk, Stripe or Slack is connected, AutonomOS reads a recent sample and proposes the recurring processes it shows, with the evidence. Sandbox data works too.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <ButtonLink href="/integrations">Connect a system</ButtonLink>
            <ButtonLink href="/discover?tab=interview" variant="outline">
              Start an interview instead
            </ButtonLink>
          </CardContent>
        </Card>
      )}
    </>
  );
}
