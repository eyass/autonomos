import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/session";
import { CAPABILITIES, capabilityInfo } from "@autonomos/integrations";
import { DEPARTMENTS, INDUSTRIES } from "@autonomos/schemas";
import { getPlaybook, isPlatformAdmin } from "@/server/playbooks";
import { PlaybookEditor, PlaybookStatus } from "./editor";

export const metadata = { title: "Edit playbook" };
export const maxDuration = 300;

export default async function EditPlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!isPlatformAdmin(session)) notFound();
  const { id } = await params;
  const p = await getPlaybook(id).catch(() => null);
  if (!p) notFound();
  return (
    <>
      <PageHeader
        back={{ href: "/admin/playbooks", label: "Playbook studio" }}
        title={p.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge variant={p.status === "published" ? "success" : "secondary"}>{p.status === "published" ? "Published" : "Draft"}</Badge>
            Needs {p.capabilities.map((c) => capabilityInfo(c)?.label.toLowerCase() ?? c).join(", ")}
          </span>
        }
        actions={<PlaybookStatus id={p.id} status={p.status} department={p.department} />}
      />
      <PlaybookEditor
        id={p.id}
        departments={DEPARTMENTS.filter((d) => d !== "Other")}
        industries={INDUSTRIES}
        capabilities={CAPABILITIES.map((c) => ({ key: c.key, label: c.label }))}
        initial={{
          title: p.title,
          summary: p.summary,
          department: p.department,
          industries: p.industries,
          trigger: p.trigger ?? "",
          steps: p.steps,
          estimatedMinutes: p.estimated_minutes_per_occurrence ? String(p.estimated_minutes_per_occurrence) : "",
          objective: p.agent.instructions.objective,
          rules: p.agent.instructions.rules.join("\n"),
          escalations: p.agent.instructions.escalationConditions.join("\n"),
          autonomyLevel: p.agent.autonomyLevel,
        }}
      />
    </>
  );
}
