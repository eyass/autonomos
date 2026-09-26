"use client";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type TagOption = { value: string; hint?: string };

// Structured multi-pick: suggestions come from what the workspace already knows (connected
// systems, departments, roles on other processes); anything else can still be added once.
export function TagPicker({ label, value, onChange, options, placeholder }: { label: string; value: string[]; onChange: (next: string[]) => void; options: TagOption[]; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const has = (x: string) => value.some((v) => v.toLowerCase() === x.toLowerCase());
  const add = (x: string) => {
    const t = x.trim();
    if (t && !has(t)) onChange([...value, t]);
  };
  const suggestions = options.filter((o) => !has(o.value));
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex min-h-9 flex-wrap gap-1.5 rounded-md border border-border p-1.5">
        {value.length ? (
          value.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1 pr-1">
              {v}
              <button type="button" className="rounded-sm opacity-70 hover:opacity-100" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
                <X className="size-3" />
              </button>
            </Badge>
          ))
        ) : (
          <span className="px-1 py-0.5 text-xs text-muted-foreground">None yet</span>
        )}
      </div>
      {suggestions.length ? (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((o) => (
            <Button key={o.value} type="button" size="sm" variant="outline" className="h-7 rounded-full px-2.5 text-xs" title={o.hint} onClick={() => add(o.value)}>
              <Plus className="size-3" />
              {o.value}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
              setDraft("");
            }
          }}
          placeholder={placeholder}
          aria-label={`Add ${label.toLowerCase()}`}
          className="h-8"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!draft.trim()}
          onClick={() => {
            add(draft);
            setDraft("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
