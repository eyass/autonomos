"use client";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Item = { id: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null };

export function Notifications({ items, markRead }: { items: Item[]; markRead: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const unread = items.filter((i) => !i.read_at).length;
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        className="relative rounded-md p-2 text-muted hover:bg-surface-muted hover:text-foreground"
        onClick={() => {
          setOpen((v) => !v);
          if (!open && unread) void markRead();
        }}
      >
        <Bell size={18} />
        {unread ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-warn" /> : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-4 py-2 text-sm font-semibold">Notifications</div>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 ? <li className="px-4 py-6 text-center text-sm text-muted">Nothing yet</li> : null}
            {items.map((n) => (
              <li key={n.id} className={cn("border-b border-border px-4 py-3 text-sm last:border-0", !n.read_at && "bg-warn-soft/40")}>
                <Link href={n.link ?? "#"} onClick={() => setOpen(false)} className="block">
                  <div className="font-medium">{n.title}</div>
                  {n.body ? <div className="mt-0.5 text-muted">{n.body}</div> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
