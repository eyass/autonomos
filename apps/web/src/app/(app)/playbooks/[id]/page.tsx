import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { isAdmin, requireSession } from "@/lib/session";
import { canUseComposio } from "@/server/integrations";
import { getPlaybook, playbookPolicyFields, playbookSensitive, playbookSlots } from "@/server/playbooks";
import { PlaybookSetup } from "./setup";
import { recordTitle } from "@/lib/titles";


export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return recordTitle("playbooks", (await params).id, "Playbook");
}

export default async function PlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const p = await getPlaybook(id, { publishedOnly: true }).catch(() => null);
  if (!p) notFound();
  const slots = await playbookSlots(session, p);
  return (
    <>
      <PageHeader
        back={{ href: "/playbooks", label: "Playbooks" }}
        title={p.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{p.department}</Badge>
            {p.summary}
          </span>
        }
      />
      <PlaybookSetup
        id={p.id}
        trigger={p.trigger}
        steps={p.steps}
        slots={slots}
        agent={{ level: p.agent.autonomyLevel, objective: p.agent.instructions.objective, escalations: p.agent.instructions.escalationConditions }}
        minutes={p.estimated_minutes_per_occurrence}
        canConnect={isAdmin(session)}
        liveConnect={canUseComposio()}
        sensitive={playbookSensitive(p)}
        policyFields={playbookPolicyFields(p)}
        currency={session.org.currency ?? "EUR"}
      />
    </>
  );
}
