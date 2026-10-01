"use client";
import { INDUSTRIES } from "@autonomos/schemas";
import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";

// Which industry's playbooks to show; changing it starts again from all departments.
export function IndustryPicker({ value, yours }: { value: string; yours: string | null }) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-2">
      <span className="text-muted-foreground">Industry</span>
      <NativeSelect aria-label="Industry" className="h-9 w-auto" value={value} onChange={(e) => router.push(`/playbooks?industry=${encodeURIComponent(e.target.value)}`)}>
        <option value="all">All industries</option>
        {INDUSTRIES.filter((i) => i !== "Other").map((i) => (
          <option key={i} value={i}>
            {i}
            {i === yours ? " (yours)" : ""}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
