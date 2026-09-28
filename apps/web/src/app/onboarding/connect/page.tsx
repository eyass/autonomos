import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ToolBrowser } from "@/components/app/tool-browser";
import { browseCategories, browseTools } from "@/server/tool-browser";
import { ActionButton } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Steps } from "../steps";
import { finishOnboardingAction } from "../actions";

export const metadata = { title: "Connect systems" };
// Continue starts the first process inventory, which runs after the response.
export const maxDuration = 300;

export default async function ConnectPage() {
  const session = await getSession();
  if (!session) redirect("/onboarding/company");
  const [categories, tools, detected, connected] = await Promise.all([
    browseCategories(session),
    browseTools(session, "popular"),
    browseTools(session, "detected"),
    browseTools(session, "connected"),
  ]);
  // The views that depend on this workspace, built here; every other view is worked out in the browser.
  const special = {
    ...(categories.some((c) => c.key === "detected") ? { detected } : {}),
    ...(categories.some((c) => c.key === "connected") ? { connected } : {}),
  };
  return (
    <>
      <Steps current={1} />
      <h1 className="mb-1 text-xl font-semibold">Connect systems</h1>
      <p className="mb-6 text-sm text-muted-foreground">Connect the tools you use. Nothing is required; agents only get the specific actions you allow later.</p>
      {/* Wider than the other onboarding steps: a category menu next to a grid of tools. */}
      <div className="relative left-1/2 w-[min(64rem,calc(100vw-2rem))] -translate-x-1/2">
        <ToolBrowser
          categories={categories}
          initialTools={tools}
          special={special}
          connected={Object.fromEntries(connected.map((t) => [t.key, t.provider]))}
          detected={session.org.detectedTools}
          canManage={session.role !== "member"}
          returnTo="/onboarding/connect"
        />
      </div>
      <div className="mt-6">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/onboarding/about">
              <ArrowLeft />
              Back to company info
            </Link>
          </Button>
          <ActionButton action={finishOnboardingAction} pendingLabel="Starting…">
            Continue
          </ActionButton>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Next, AutonomOS drafts your first process inventory from your website and connected systems.</p>
      </div>
    </>
  );
}
