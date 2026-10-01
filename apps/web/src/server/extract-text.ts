import "server-only";
import { HttpError } from "@/lib/session";

// Plain text from an uploaded PDF, DOCX, TXT or MD file (company knowledge and document import).
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_TYPES = ".pdf,.docx,.txt,.md";

export async function extractFileText(file: File): Promise<{ title: string; content: string; mime: string }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "Files must be under 10 MB");
  const name = file.name.toLowerCase();
  const buffer = new Uint8Array(await file.arrayBuffer());
  const title = file.name.replace(/\.(pdf|docx|txt|md)$/i, "");
  if (name.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(buffer);
    const { text } = await extractText(pdf, { mergePages: true });
    return { title, content: text, mime: "application/pdf" };
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return { title, content: value, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }
  if (name.endsWith(".txt") || name.endsWith(".md")) return { title, content: new TextDecoder().decode(buffer), mime: name.endsWith(".md") ? "text/markdown" : "text/plain" };
  throw new HttpError(415, "Upload a PDF, DOCX, TXT or MD file");
}
