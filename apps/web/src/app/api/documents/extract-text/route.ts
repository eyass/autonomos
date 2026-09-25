import { handle } from "@/lib/actions";
import { HttpError, requireSessionOrThrow } from "@/lib/session";

// Extracts plain text from uploaded PDF, DOCX, TXT or MD files for process import.
export async function POST(request: Request) {
  return handle(async () => {
    await requireSessionOrThrow();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file uploaded");
    if (file.size > 10 * 1024 * 1024) throw new HttpError(413, "Files must be under 10 MB");
    const name = file.name.toLowerCase();
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (name.endsWith(".pdf")) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(buffer);
      const { text } = await extractText(pdf, { mergePages: true });
      return { title: file.name.replace(/\.pdf$/i, ""), content: text };
    }
    if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      return { title: file.name.replace(/\.docx$/i, ""), content: value };
    }
    if (name.endsWith(".txt") || name.endsWith(".md")) {
      return { title: file.name.replace(/\.(txt|md)$/i, ""), content: new TextDecoder().decode(buffer) };
    }
    throw new HttpError(415, "Upload a PDF, DOCX, TXT or MD file");
  });
}
