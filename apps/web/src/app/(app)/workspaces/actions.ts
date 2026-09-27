"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { runAction } from "@/lib/actions";
import { adminDb, requireRole, requireSessionOrThrow } from "@/lib/session";

// Renames the current workspace. Owners and admins only.
export async function renameWorkspaceAction(_: unknown, form: FormData) {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    requireRole(session, ["owner", "admin"]);
    const name = z
      .string()
      .trim()
      .min(1, "Give the workspace a name")
      .max(100)
      .parse(String(form.get("name") ?? ""));
    const { error } = await adminDb().from("organizations").update({ name }).eq("id", session.org.id);
    if (error) throw new Error(error.message);
    await audit(session, { action: "organization.renamed", input: { name } });
    revalidatePath("/(app)", "layout");
  });
}
