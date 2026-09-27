"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Moves on by itself once the work is done, after a moment to see the result.
export function AutoRedirect({ href, delayMs = 3000 }: { href: string; delayMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace(href), delayMs);
    return () => clearTimeout(t);
  }, [href, delayMs, router]);
  return null;
}
