import { BookText } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { KnowledgeManager } from "@/components/knowledge/knowledge-manager";
import { isAdmin, requireSession } from "@/lib/session";
import { companyBrief, listSources, startWaitingSources } from "@/server/knowledge";

export const metadata = { title: "Knowledge" };

// Everything AutonomOS knows about how the company works: the sources it was given and the
// brief it built from them, used by discovery, ideas and every agent.
export default async function KnowledgePage() {
  const session = await requireSession();
  await startWaitingSources(session);
  const [sources, { brief }] = await Promise.all([listSources(session), companyBrief(session)]);
  return (
    <>
      <PageHeader
        icon={BookText}
        tone="rose"
        title="Knowledge"
        description="What AutonomOS knows about how your company works. Agents look things up here, and discovery and ideas start from it."
      />
      <KnowledgeManager initialSources={sources} initialBrief={brief} canEdit={isAdmin(session)} />
    </>
  );
}
