import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/session";
import { DEPARTMENTS } from "@autonomos/schemas";
import { getPlaybook, isPlatformAdmin, offeredTools, toolkitInfo } from "@/server/playbooks";
import { PlaybookEditor, PlaybookStatus } from "./editor";

export const metadata = { title: "Edit playbook" };
export const maxDuration = 300;

export default async function EditPlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!isPlatformAdmin(session)) notFound();
  const { id } = await params;
  const p = await getPlaybook(id).catch(() => null);
  if (!p) notFound();
  const [tools, info] = await Promise.all([offeredTools(p), toolkitInfo(p.toolkits)]);
  return (
    <>
      <PageHeader
        back={{ href: "/admin/playbooks", label: "Playbook studio" }}
        title={p.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge variant={p.status === "published" ? "success" : "secondary"}>{p.status === "published" ? "Published" : "Draft"}</Badge>
            {p.toolkits.map((k) => info.get(k)?.name ?? k).join(", ")}
          </span>
        }
        actions={<PlaybookStatus id={p.id} status={p.status} firstToolkit={p.toolkits[0] ?? ""} />}
      />
      <PlaybookEditor
        id={p.id}
        departments={[...DEPARTMENTS]}
        initial={{
          title: p.title,
          summary: p.summary,
          department: p.department,
          trigger: p.trigger ?? "",
          steps: p.steps.map((s) => s.title).join("\n"),
          estimatedMinutes: p.estimated_minutes_per_occurrence ? String(p.estimated_minutes_per_occurrence) : "",
          objective: p.agent.instructions.objective,
          rules: p.agent.instructions.rules.join("\n"),
          escalations: p.agent.instructions.escalationConditions.join("\n"),
          tools: p.agent.tools,
          autonomyLevel: p.agent.autonomyLevel,
        }}
        tools={tools.map((t) => ({ ...t, system: info.get(t.integration)?.name ?? (t.integration === "knowledge" ? "Company knowledge" : t.integration) }))}
      />
    </>
  );
}
