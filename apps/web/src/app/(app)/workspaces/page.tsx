import { JobButton } from "@/components/app/job";
import { latestJob } from "@/server/jobs";
import { Plus } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { ButtonLink } from "@/components/app/button-link";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { isAdmin, requireSession } from "@/lib/session";
import { listWorkspaces } from "@/server/platform";
import { DeleteWorkspace } from "../settings/forms";
import { switchWorkspaceAction } from "../shell-actions";
import { RenameWorkspace } from "./rename";

export const metadata = { title: "Workspaces" };

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

// Every workspace you belong to: switch between them, add one, and rename or delete the one you are in.
export default async function WorkspacesPage() {
  const session = await requireSession();
  const sampleJob = await latestJob({ userId: session.user.id, organizationId: session.org.id, kind: "sample_workspace" });
  const workspaces = await listWorkspaces(session);
  const current = workspaces.find((w) => w.id === session.org.id);
  const others = workspaces.filter((w) => w.id !== session.org.id);
  return (
    <>
      <PageHeader
        title="Workspaces"
        description="Each workspace is one company, with its own processes, agents, systems and members."
        actions={
          <>
            <ButtonLink href="/onboarding/company?new=1">
              <Plus />
              Add workspace
            </ButtonLink>
            {workspaces.some((w) => w.is_demo) ? null : (
              <JobButton variant="outline" kind="sample_workspace" initialJob={sampleJob} pendingLabel="Setting up…">
                Explore a sample workspace
              </JobButton>
            )}
          </>
        }
      />
      {current ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">You are in</h2>
          <Card className="gap-4 px-4 py-4 sm:px-6" data-testid="current-workspace">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{current.name}</span>
              <Badge variant="success">Current</Badge>
              {current.is_demo ? <Badge variant="info">Sample</Badge> : null}
              <span className="text-xs text-muted-foreground">{ROLE[current.role] ?? current.role}</span>
            </div>
            {isAdmin(session) ? <RenameWorkspace name={current.name} /> : <p className="text-sm text-muted-foreground">Only owners and admins can rename it.</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div className="text-sm">
                <div className="font-medium">Delete this workspace</div>
                <div className="text-muted-foreground">{session.role === "owner" ? "Removes everything in it, for every member. This cannot be undone." : "Only the owner can delete it."}</div>
              </div>
              {session.role === "owner" ? <DeleteWorkspace name={current.name} /> : null}
            </div>
          </Card>
        </section>
      ) : null}
      {others.length ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Your other workspaces</h2>
          <Card className="gap-0 py-0">
            {others.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-0 sm:px-6">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{w.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {ROLE[w.role] ?? w.role}
                    {w.is_demo ? " · sample" : ""}
                  </div>
                </div>
                <ActionButton size="sm" variant="outline" action={switchWorkspaceAction.bind(null, w.id)}>
                  Switch
                </ActionButton>
              </div>
            ))}
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">Switch to a workspace to rename or delete it.</p>
        </section>
      ) : null}
    </>
  );
}
