import { PlaybookDraftSchema, type PlaybookDraft } from "@autonomos/schemas";
import { generateStructured, type UsageSink } from "../generate";
import { section } from "../prompt";

type ToolSummary = { key: string; label: string; description: string; access: "read" | "write" };

// Drafts a ready-made playbook for one tool: a common, valuable piece of recurring work done in
// it, the process a person follows today, and the agent that takes it over using only the tool's
// real actions. Site administrators review and edit it before publishing.
export async function generatePlaybook(input: {
  tool: { key: string; name: string; description: string };
  goal?: string;
  availableTools: ToolSummary[];
  existingTitles: string[];
  onUsage?: UsageSink;
}): Promise<PlaybookDraft> {
  const { object } = await generateStructured({
    purpose: "playbook_generation",
    modelClass: "SMART_MODEL",
    schema: PlaybookDraftSchema,
    schemaName: "PlaybookDraft",
    systemRules: [
      "You are AutonomOS, writing a ready-made automation playbook that any company using this tool can start from.",
      "Pick recurring work that is common for companies using the tool and clearly worth automating: frequent, rule-based, and tied to money, customers or growth. Never a one-off setup task.",
      "If a goal is given, the playbook must serve it.",
      "Do not repeat a playbook in existingTitles.",
      "Use only tool keys from availableTools. Include the read tools the agent needs to understand the work, not only the writes.",
      "Anything that moves money, messages customers, touches personal data or deletes records runs at autonomy level 3 at most, with a person approving.",
      "Write the instructions as operating procedure: objective, context, must-follow rules, steps, when to escalate, and what done means.",
      "Plain business language. Short step titles.",
    ],
    sections: [section("tool", input.tool), ...(input.goal ? [section("goal", input.goal)] : []), section("available_tools", input.availableTools), section("existing_titles", input.existingTitles)],
    task: "Draft the playbook.",
    mock: () => mockPlaybook(input.tool.name, input.availableTools),
    onUsage: input.onUsage,
  });
  const allowed = new Set(input.availableTools.map((t) => t.key));
  return { ...object, agent: { ...object.agent, tools: object.agent.tools.filter((t) => allowed.has(t)) } };
}

function mockPlaybook(tool: string, tools: ToolSummary[]): PlaybookDraft {
  const reads = tools.filter((t) => t.access === "read").slice(0, 2);
  const writes = tools.filter((t) => t.access === "write").slice(0, 1);
  return {
    title: `${tool} follow-up`,
    summary: `Follows up on new ${tool} records the same day, with a person approving every change.`,
    department: "Operations",
    trigger: `A new record appears in ${tool}`,
    steps: [
      { title: `Open the new record in ${tool}`, system: tool, performedBy: "Operations" },
      { title: "Check it against the rules", performedBy: "Operations", requiresJudgement: true },
      { title: `Update ${tool}`, system: tool, performedBy: "Operations" },
    ],
    estimatedMinutesPerOccurrence: 6,
    agent: {
      name: `${tool} follow-up`,
      description: `Reads new ${tool} records and prepares the follow-up for approval.`,
      autonomyLevel: 3,
      instructions: {
        objective: `Follow up on every new ${tool} record the same day.`,
        context: "",
        rules: ["Never change a record without approval"],
        steps: ["Read the record", "Decide the follow-up", "Propose the change"],
        escalationConditions: ["Information is missing", "The request is unusual"],
        successConditions: ["The record is followed up"],
      },
      tools: [...reads, ...writes].map((t) => t.key),
      successCriteria: ["Followed up the same day"],
    },
  };
}
