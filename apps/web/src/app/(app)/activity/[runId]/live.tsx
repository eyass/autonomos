"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Refreshes the run page while it is still moving.
export function LiveRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
