"use client";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Item = { id: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null };

export function Notifications({ items, markRead }: { items: Item[]; markRead: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const unread = items.filter((i) => !i.read_at).length;
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && unread) void markRead();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell />
          {unread ? <span className="absolute right-2 top-2 size-2 rounded-full bg-warning" /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] p-0 sm:w-80">
        <div className="border-b px-4 py-2.5 text-sm font-semibold">Notifications</div>
        <ScrollArea className="max-h-[60vh]">
          {items.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing yet</p> : null}
          {items.map((n) => (
            <Link key={n.id} href={n.link ?? "#"} onClick={() => setOpen(false)} className={cn("block border-b px-4 py-3 text-sm last:border-0 hover:bg-accent", !n.read_at && "bg-warning-soft/40")}>
              <div className="font-medium">{n.title}</div>
              {n.body ? <div className="mt-0.5 text-muted-foreground">{n.body}</div> : null}
            </Link>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
