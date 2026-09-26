import { DEPARTMENTS } from "@autonomos/schemas";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { NewProcessForm } from "./form";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata = { title: "Add process" };

export default async function NewProcessPage() {
  const session = await requireSession();
  const { data } = await (await createClient()).from("departments").select("name").eq("organization_id", session.org.id).is("archived_at", null).order("name");
  const names = [...new Set([...(data ?? []).map((d) => d.name), ...DEPARTMENTS])];
  return (
    <>
      <PageHeader back={{ href: "/processes", label: "Processes" }} title="Add process" description="Describe a recurring process. You can refine every field after it is created." />
      <Alert className="mb-4">
        <Sparkles />
        <AlertTitle>Let AutonomOS find processes for you</AlertTitle>
        <AlertDescription>
          <span>
            It reads your connected systems and proposes the recurring work it finds, with the evidence.{" "}
            <Link href="/discover" className="font-medium underline">
              Find processes
            </Link>
          </span>
        </AlertDescription>
      </Alert>
      <NewProcessForm departments={names} />
    </>
  );
}
