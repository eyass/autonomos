// Area colours (globals.css, --area-*): one per part of the product, so a page, a sidebar item
// and its stat tiles share a colour. Full class strings, so Tailwind sees every one of them.
export type Tone = "brand" | "agent" | "green" | "blue" | "violet" | "amber" | "rose";

export const TONE: Record<Tone, { tile: string; tint: string; bar: string; text: string }> = {
  brand: { tile: "border-brand/15 bg-brand-soft text-brand", tint: "from-brand-soft", bar: "bg-brand", text: "text-brand-strong" },
  agent: { tile: "border-highlight/25 bg-highlight-soft text-highlight-strong", tint: "from-highlight-soft", bar: "bg-highlight", text: "text-highlight-strong" },
  green: { tile: "border-area-green/20 bg-area-green-soft text-area-green-strong", tint: "from-area-green-soft", bar: "bg-area-green", text: "text-area-green-strong" },
  blue: { tile: "border-area-blue/20 bg-area-blue-soft text-area-blue-strong", tint: "from-area-blue-soft", bar: "bg-area-blue", text: "text-area-blue-strong" },
  violet: { tile: "border-area-violet/20 bg-area-violet-soft text-area-violet-strong", tint: "from-area-violet-soft", bar: "bg-area-violet", text: "text-area-violet-strong" },
  amber: { tile: "border-area-amber/25 bg-area-amber-soft text-area-amber-strong", tint: "from-area-amber-soft", bar: "bg-area-amber", text: "text-area-amber-strong" },
  rose: { tile: "border-area-rose/20 bg-area-rose-soft text-area-rose-strong", tint: "from-area-rose-soft", bar: "bg-area-rose", text: "text-area-rose-strong" },
};

// Which colour each part of the app wears.
export const AREA = {
  home: "green",
  inbox: "agent",
  work: "blue",
  ideas: "amber",
  playbooks: "amber",
  agents: "brand",
  history: "violet",
  integrations: "rose",
} as const satisfies Record<string, Tone>;

// A fixed sequence for things with no area of their own (stat tiles, departments, chart series).
export const SEQUENCE: Tone[] = ["green", "blue", "violet", "amber", "rose", "brand"];
export const toneAt = (i: number): Tone => SEQUENCE[i % SEQUENCE.length];

// A stable colour for a name (a department, a system): the same name always gets the same tone.
export function toneFor(name: string): Tone {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return toneAt(h);
}
