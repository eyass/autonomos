import { requireApiSession } from "@/lib/api-auth";
import { handle } from "@/lib/actions";
import { HttpError } from "@/lib/session";
import { addFileSource } from "@/server/knowledge";

export const maxDuration = 120;

// POST /api/knowledge/upload: one or more files (field "file") become knowledge sources.
// Each file is read on its own; one that cannot be read is reported and the rest still count.
export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireApiSession(request);
    const files = (await request.formData()).getAll("file").filter((f): f is File => f instanceof File);
    if (!files.length) throw new HttpError(400, "No file uploaded");
    const added: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];
    for (const file of files.slice(0, 20)) {
      try {
        added.push(await addFileSource(session, file));
      } catch (e) {
        failed.push({ name: file.name, error: e instanceof Error ? e.message : "Could not read this file" });
      }
    }
    return { added, failed };
  });
}
