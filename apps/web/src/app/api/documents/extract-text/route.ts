import { requireApiSession } from "@/lib/api-auth";
import { handle } from "@/lib/actions";
import { HttpError } from "@/lib/session";
import { extractFileText } from "@/server/extract-text";

// Extracts plain text from uploaded PDF, DOCX, TXT or MD files for process import.
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiSession(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file uploaded");
    const { title, content } = await extractFileText(file);
    return { title, content };
  });
}
