import "server-only";
import { sendNotification } from "@autonomos/db";
import { after } from "next/server";
import { adminDb, type Session } from "@/lib/session";
import { draftInitialInventory } from "@/server/processes";
import { connections, readConnectedSystems } from "@/server/system-discovery";

// The first process inventory at the end of onboarding, run on the server after the page
// changes, with each step written to the organisation so the progress page can follow it:
// the website, each connected system, drafting, saving.

export type MappingStep = { key: string; label: string; state: "pending" | "running" | "done" | "skipped" | "failed"; detail?: string };
export type MappingProgress = {
  status: "running" | "done" | "failed";
  steps: MappingStep[];
  drafted: number;
  titles: string[];
  startedAt: string;
  updatedAt: string;
  error?: string;
};

// A run that has not moved for this long was cut off (the server stopped).
export const MAPPING_STALE_MS = 6 * 60_000;

export function isStale(p: MappingProgress) {
  return p.status === "running" && Date.now() - new Date(p.updatedAt).getTime() > MAPPING_STALE_MS;
}

export async function loadMapping(organizationId: string): Promise<MappingProgress | null> {
  const { data } = await adminDb().from("organizations").select("initial_inventory").eq("id", organizationId).maybeSingle();
  return (data?.initial_inventory as MappingProgress | null) ?? null;
}

async function save(organizationId: string, p: MappingProgress) {
  p.updatedAt = new Date().toISOString();
  await adminDb()
    .from("organizations")
    .update({ initial_inventory: p as never })
    .eq("id", organizationId);
}

// Writes the plan and starts the work in the background. Starting again while a run is
// still moving does nothing.
export async function startMapping(session: Session) {
  const current = await loadMapping(session.org.id);
  if (current?.status === "running" && !isStale(current)) return;
  const profile = session.org.websiteProfile;
  const systems = await connections(session);
  const now = new Date().toISOString();
  const progress: MappingProgress = {
    status: "running",
    steps: [
      {
        key: "company",
        label: profile ? "Reading your website" : "Reading your company info",
        state: "done",
        detail: [session.org.name, session.org.industry].filter(Boolean).join(" · "),
      },
      ...systems.map((c) => ({ key: `system:${c.key}`, label: `Reading ${c.name}`, state: "pending" as const })),
      { key: "draft", label: "Drafting your processes", state: "pending" },
      { key: "save", label: "Saving drafts to review", state: "pending" },
    ],
    drafted: 0,
    titles: [],
    startedAt: now,
    updatedAt: now,
  };
  await save(session.org.id, progress);
  after(() => runMapping(session, progress));
}

async function runMapping(session: Session, p: MappingProgress) {
  const step = (key: string) => p.steps.find((s) => s.key === key)!;
  const set = async (key: string, state: MappingStep["state"], detail?: string) => {
    const s = step(key);
    if (!s) return;
    s.state = state;
    if (detail !== undefined) s.detail = detail;
    await save(session.org.id, p);
  };
  try {
    const evidence = await readConnectedSystems(session, (r) => set(`system:${r.key}`, r.state, r.line));
    await set("draft", "running");
    const ids = await draftInitialInventory(session, evidence);
    await set("draft", "done", `${ids.length} process${ids.length === 1 ? "" : "es"} found`);
    const { data } = ids.length ? await adminDb().from("processes").select("title").eq("organization_id", session.org.id).in("id", ids.slice(0, 6)) : { data: [] };
    await set("save", "done", ids.length ? "Ready for you to review" : "Nothing to save");
    p.status = "done";
    p.drafted = ids.length;
    p.titles = (data ?? []).map((r) => r.title);
    await save(session.org.id, p);
    if (ids.length)
      await sendNotification(adminDb(), session.org.id, {
        kind: "discovery_ready",
        title: "Your first process inventory is ready",
        body: `${ids.length} process${ids.length === 1 ? "" : "es"} drafted for you to review.`,
        link: "/processes?status=draft",
        key: `first_inventory_ready:${p.startedAt}`,
      }).catch((e) => console.error("notification failed", e));
  } catch (e) {
    console.error("first inventory failed", e);
    for (const s of p.steps) if (s.state === "running" || s.state === "pending") s.state = s.state === "running" ? "failed" : "skipped";
    p.status = "failed";
    p.error = "Drafting the first inventory did not finish.";
    await save(session.org.id, p);
    await sendNotification(adminDb(), session.org.id, {
      kind: "discovery_failed",
      title: "Your first process inventory did not finish",
      body: "Nothing was lost. Open Discover to read your systems again, or add processes by interview.",
      link: "/discover",
      key: `first_inventory_failed:${p.startedAt}`,
    }).catch((err) => console.error("notification failed", err));
  }
}
