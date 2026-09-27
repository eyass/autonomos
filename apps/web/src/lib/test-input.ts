// What is wrong with a test run's input, checked the same way in the browser and on the
// server. Errors stop the run; warnings need an explicit "run anyway".
const PLACEHOLDERS = [/^describe the record/i, /^add the facts/i, /^a typical request for /i, /^the run covers this period/i];
const MAX_BYTES = 50_000;

export type InputCheck = { errors: string[]; warnings: string[]; value: Record<string, unknown> | null };

export function checkTestInput(raw: string | Record<string, unknown>): InputCheck {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (new TextEncoder().encode(raw).length > MAX_BYTES) return { errors: ["The input is too large. Keep it under 50 KB."], warnings: [], value: null };
    try {
      value = JSON.parse(raw);
    } catch {
      return { errors: ["The input is not valid JSON. Check for a missing quote, comma or brace."], warnings: [], value: null };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { errors: ['The input must be a JSON object, like { "request": "…" }.'], warnings: [], value: null };
  const obj = value as Record<string, unknown>;
  const warnings: string[] = [];
  if (!Object.keys(obj).length) warnings.push("The input is empty. Use the sample input, or add the facts this run should work on.");
  const placeholders: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string" && PLACEHOLDERS.some((p) => p.test(v.trim()))) placeholders.push(path);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(obj, "");
  if (placeholders.length) warnings.push(`Still the sample text: ${placeholders.join(", ")}. Replace it with real details, or the agent works on the placeholder.`);
  return { errors: [], warnings, value: obj };
}
