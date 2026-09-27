import { LinkTabs } from "@/components/app/link-tabs";

// Work holds the processes a team runs and the ideas for automating them.
export function WorkTabs({ active }: { active: "processes" | "ideas" }) {
  return (
    <LinkTabs
      items={[
        { href: "/processes", label: "Processes", active: active === "processes" },
        { href: "/opportunities", label: "Automation ideas", active: active === "ideas" },
      ]}
    />
  );
}
