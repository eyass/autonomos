// Text tools for company knowledge: personal details out, then passages small enough to
// search and quote. Pure functions, used by ingestion for every kind of source.

export type Passage = { heading: string | null; content: string };

// Emails, phone numbers and IBANs out of support material before it is stored. Line breaks
// stay, so headings and paragraphs survive for splitting.
export function redactPersonal(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, "[iban]")
    .replace(/\+?\d[\d ().-]{7,}\d/g, (m) => (/^\d{4}-\d{2}-\d{2}$/.test(m.trim()) || !/[ ()+.-]/.test(m) ? m : "[phone]"));
}

const HEADING = /^#{1,6}\s+(.+)$/;

// Passages of at most `max` characters: by heading first, then paragraph, then sentence,
// with `overlap` characters repeated from the previous passage so a rule split across two
// passages is still found whole in one of them.
export function splitPassages(text: string, opts: { max?: number; overlap?: number } = {}): Passage[] {
  const max = opts.max ?? 1500;
  const overlap = Math.min(opts.overlap ?? 150, Math.floor(max / 4));
  const sections: Array<{ heading: string | null; body: string[] }> = [];
  let current: { heading: string | null; body: string[] } = { heading: null, body: [] };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const h = HEADING.exec(line);
    if (h) {
      if (current.body.length || current.heading) sections.push(current);
      current = { heading: h[1]!.trim(), body: [] };
    } else if (line) current.body.push(line);
  }
  sections.push(current);

  const out: Passage[] = [];
  for (const s of sections) {
    const body = s.body.join("\n").trim();
    if (!body) continue;
    for (const content of pack(body, max, overlap)) out.push({ heading: s.heading, content });
  }
  return out;
}

// Paragraphs, or sentences of a long paragraph, packed into chunks of at most `max`.
function pack(body: string, max: number, overlap: number): string[] {
  if (body.length <= max) return [body];
  const pieces = body.split(/\n+/).flatMap((p) => (p.length <= max ? [p] : (p.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [p]).flatMap((s) => hardWrap(s.trim(), max))));
  const chunks: string[] = [];
  let chunk = "";
  for (const piece of pieces) {
    const next = chunk ? `${chunk}${chunk.endsWith("\n") ? "" : " "}${piece}` : piece;
    if (next.length <= max) {
      chunk = next;
      continue;
    }
    if (chunk) chunks.push(chunk);
    const carry = chunk ? tail(chunk, overlap) : "";
    chunk = carry && carry.length + 1 + piece.length <= max ? `${carry} ${piece}` : piece;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function hardWrap(s: string, max: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
  return out.filter(Boolean);
}

// The last `n` characters, starting at a word.
function tail(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(-n);
  const space = cut.indexOf(" ");
  return (space >= 0 ? cut.slice(space + 1) : cut).trim();
}
