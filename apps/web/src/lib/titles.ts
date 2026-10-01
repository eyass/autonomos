import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

// Browser tab titles for detail pages: the record's own name, so open tabs and bookmarks can be
// told apart. Read with the visitor's session, so row level security hides other workspaces;
// anything not found falls back to the generic title.
type Titled = "agents" | "processes" | "automation_opportunities" | "playbooks";
const COLUMN: Record<Titled, "name" | "title"> = { agents: "name", processes: "title", automation_opportunities: "title", playbooks: "title" };

export async function recordTitle(table: Titled, id: string, fallback: string, prefix = ""): Promise<Metadata> {
  const supabase = await createClient();
  const { data } = await supabase.from(table).select(COLUMN[table]).eq("id", id).maybeSingle();
  const name = (data as Record<string, string> | null)?.[COLUMN[table]];
  return { title: name ? `${prefix}${name}` : fallback };
}

export async function runTitle(id: string): Promise<Metadata> {
  const supabase = await createClient();
  const { data } = await supabase.from("agent_runs").select("mode, agents(name)").eq("id", id).maybeSingle();
  const name = (data?.agents as unknown as { name: string } | null)?.name;
  return { title: name ? `${name} · ${data?.mode === "test" ? "test run" : "run"}` : "Run" };
}
