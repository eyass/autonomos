import { Check, CircleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/app/button-link";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/session";
import { connectedIntegrationKeys } from "@/server/opportunities";
import { getPlaybook, offeredTools, toolkitInfo } from "@/server/playbooks";
import { SystemLogo } from "../../integrations/add-systems";
import { UsePlaybookForm } from "./use-form";

export const metadata = { title: "Playbook" };

const LEVEL: Record<number, string> = {
  2: "Drafts the work; a person sends it",
  3: "Proposes each action; a person approves it",
  4: "Acts on routine cases; asks a person about the rest",
};

export default async function PlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const p = await getPlaybook(id, { publishedOnly: true }).catch(() => null);
  if (!p) notFound();
  const [info, connected, offered] = await Promise.all([toolkitInfo(p.toolkits), connectedIntegrationKeys(session), offeredTools(p)]);
  const have = new Set(connected);
  const missing = p.toolkits.filter((k) => !have.has(k));
  const actions = p.agent.tools.map((k) => offered.find((t) => t.key === k)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  const name = (k: string) => info.get(k)?.name ?? (k === "knowledge" ? "Company knowledge" : k);
  return (
    <>
      <PageHeader back={{ href: "/playbooks", label: "Playbooks" }} title={p.title} description={p.summary} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Card className="gap-3 px-4 py-4 sm:gap-3 sm:py-4 sm:px-6">
            <h2 className="text-sm font-semibold">The work today</h2>
            {p.trigger ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Starts when </span>
                {p.trigger.replace(/^./, (c) => c.toLowerCase())}
              </p>
            ) : null}
            <ol className="space-y-2">
              {p.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">{i + 1}</span>
                  <span className="pt-0.5">{s.title}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="gap-3 px-4 py-4 sm:gap-3 sm:py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">The agent</h2>
              <Badge variant="info">Level {p.agent.autonomyLevel}</Badge>
              <span className="text-xs text-muted-foreground">{LEVEL[p.agent.autonomyLevel]}</span>
            </div>
            <p className="text-sm">{p.agent.instructions.objective}</p>
            <ul className="space-y-1.5" aria-label="Actions">
              {actions.map((t) => (
                <li key={t.key} className="flex items-center gap-2 text-sm">
                  <SystemLogo src={info.get(t.integration)?.logo ?? null} name={name(t.integration)} className="size-5" />
                  <span className="min-w-0 truncate">{t.label}</span>
                  <Badge variant={t.access === "read" ? "secondary" : "warning"} className="ml-auto">
                    {t.access === "read" ? "Reads" : "Acts"}
                  </Badge>
                </li>
              ))}
            </ul>
            {p.agent.instructions.escalationConditions.length ? (
              <div className="border-t pt-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Hands to a person when</div>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {p.agent.instructions.escalationConditions.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        </div>
        <aside className="space-y-4">
          <Card className="gap-3 px-4 py-4 sm:gap-3 sm:py-4">
            <h2 className="text-sm font-semibold">Tools</h2>
            <ul className="space-y-2">
              {p.toolkits.map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm">
                  <SystemLogo src={info.get(k)?.logo ?? null} name={name(k)} className="size-6" />
                  <span className="flex-1">{name(k)}</span>
                  {have.has(k) ? (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <Check className="size-3.5" />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-warning">
                      <CircleAlert className="size-3.5" />
                      Not connected
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {missing.length ? (
              <ButtonLink href="/integrations" variant="outline" size="sm">
                Connect {missing.map(name).join(" and ")}
              </ButtonLink>
            ) : null}
          </Card>
          <Card className="gap-3 px-4 py-4 sm:gap-3 sm:py-4">
            <h2 className="text-sm font-semibold">Start from this playbook</h2>
            <UsePlaybookForm id={p.id} minutes={p.estimated_minutes_per_occurrence} />
          </Card>
        </aside>
      </div>
    </>
  );
}
