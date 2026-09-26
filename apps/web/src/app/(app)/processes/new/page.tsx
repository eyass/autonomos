import { DEPARTMENTS } from "@autonomos/schemas";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { NewProcessForm } from "./form";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Add process" };

export default async function NewProcessPage() {
  const session = await requireSession();
  const { data } = await (await createClient()).from("departments").select("name").eq("organization_id", session.org.id).is("archived_at", null).order("name");
  const names = [...new Set([...(data ?? []).map((d) => d.name), ...DEPARTMENTS])];
  return (
    <>
      <PageHeader back={{ href: "/processes", label: "Processes" }} title="Add process" description="Describe a recurring process. You can refine every field after it is created." />
      <NewProcessForm departments={names} />
    </>
  );
}
