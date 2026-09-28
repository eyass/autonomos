import { describe, expect, it } from "vitest";
import { generatePlaybook } from "./tasks/playbooks";

process.env.AI_MOCK = "1";

const tools = [
  { key: "zendesk.read_ticket", label: "Read ticket", description: "Reads a ticket", access: "read" as const },
  { key: "zendesk.search_tickets", label: "Search tickets", description: "Searches tickets", access: "read" as const },
  { key: "zendesk.reply", label: "Reply", description: "Replies to a ticket", access: "write" as const },
];

describe("generatePlaybook", () => {
  it("drafts a playbook that uses only the tool's actions", async () => {
    const p = await generatePlaybook({ tool: { key: "zendesk", name: "Zendesk", description: "Help desk" }, availableTools: tools, existingTitles: [] });
    expect(p.title).toContain("Zendesk");
    expect(p.steps.length).toBeGreaterThanOrEqual(3);
    expect(p.agent.tools.length).toBeGreaterThan(0);
    expect(p.agent.tools.every((t) => tools.some((x) => x.key === t))).toBe(true);
    expect(p.agent.tools).toContain("zendesk.read_ticket");
    expect(p.agent.autonomyLevel).toBeLessThanOrEqual(3);
  });

  it("drops tools the model invents", async () => {
    const p = await generatePlaybook({ tool: { key: "zendesk", name: "Zendesk", description: "" }, availableTools: tools.slice(0, 1), existingTitles: [] });
    expect(p.agent.tools).toEqual(["zendesk.read_ticket"]);
  });
});
