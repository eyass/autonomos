"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// "On this page" for long-form pages: the h2s of the element with `data-toc`, listed beside the
// text on wide screens, with the section in view marked. Headings without an id get one.
const slug = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function OnThisPage({ min = 3 }: { min?: number }) {
  const [items, setItems] = useState<Array<{ id: string; text: string }>>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const hs = [...document.querySelectorAll<HTMLHeadingElement>("[data-toc] h2")];
    for (const h of hs) if (!h.id) h.id = slug(h.textContent ?? "");
    // Read once on mount: the headings are rendered on the server and do not change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(hs.map((h) => ({ id: h.id, text: h.textContent ?? "" })));
    // The section in view is the last heading that has scrolled past the top of the window, or
    // the last section once the page is scrolled to the end (its heading may never reach the top).
    const update = () => {
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const passed = atEnd ? hs : hs.filter((h) => h.getBoundingClientRect().top < 120);
      setActive((passed.at(-1) ?? hs[0])?.id ?? null);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  if (items.length < min) return null;
  return (
    <nav aria-label="On this page" className="sticky top-24 hidden self-start xl:block">
      <p className="eyebrow text-muted-foreground">On this page</p>
      <ul className="mt-3 space-y-1 border-l border-border text-sm">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              className={cn(
                "-ml-px block border-l-2 py-1 pl-3 transition-colors",
                active === i.id ? "border-highlight font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {i.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
