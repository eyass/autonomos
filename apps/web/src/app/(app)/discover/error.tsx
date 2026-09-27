"use client";
import { ErrorPanel } from "@/components/app/error-panel";

// Each way of discovering work is its own tab, so one failing never blocks the others.
export default function DiscoverError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorPanel
      error={error}
      reset={reset}
      what="discovery"
      links={[
        { href: "/discover?tab=document", label: "Open Document tab" },
        { href: "/discover?tab=interview", label: "Open Interview" },
      ]}
    />
  );
}
