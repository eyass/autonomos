"use client";
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// A small "what does this mean" button. A popover rather than a hover tooltip, so it works
// with a tap on a phone and with the keyboard.
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={label}
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}
