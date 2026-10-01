import { PlaybookDraftSchema, PlaybookToolChoiceSchema, type PlaybookDraft, type PlaybookStep } from "@autonomos/schemas";
import { generateStructured, type UsageSink } from "../generate";
import { section } from "../prompt";

type CapabilitySummary = { key: string; label: string; hint: string };

// Drafts a ready-made playbook: recurring work common to many companies, written as steps that
// name the kind of system each one needs (a help desk, a payment system), never a product, so
// any company can connect its own tools. Site administrators review it before publishing.
export async function generatePlaybook(input: { department?: string; goal?: string; capabilities: CapabilitySummary[]; existingTitles: string[]; onUsage?: UsageSink }): Promise<PlaybookDraft> {
  const allowed = new Set(input.capabilities.map((c) => c.key));
  const { object } = await generateStructured({
    purpose: "playbook_generation",
    modelClass: "SMART_MODEL",
    schema: PlaybookDraftSchema,
    schemaName: "PlaybookDraft",
    systemRules: [
      "You are AutonomOS, writing a ready-made automation playbook that any company can start from, whatever tools it uses.",
      "Pick recurring work that is common and clearly worth automating: frequent, rule-based, and tied to money, customers or growth. Never a one-off setup task.",
      "If a goal is given, the playbook must serve it. If a department is given, the work belongs to it.",
      "Do not repeat a playbook in existingTitles.",
      "Never name a product or vendor anywhere. Say 'the help desk', 'the payment system', 'the CRM'.",
      "Each step that looks something up or changes something names its capability (a key from capabilities) and whether it reads or writes. Judgement steps have capability null and access none.",
      "Include the read steps the agent needs to understand the case before any write.",
      "Anything that moves money, messages customers, touches personal data or deletes records runs at autonomy level 3 (Approve) at most, with a person approving.",
      "Write the instructions as operating procedure: objective, context, must-follow rules, steps, when to hand to a person, and what done means.",
      "Plain business language. Short step titles.",
    ],
    sections: [
      ...(input.department ? [section("department", input.department)] : []),
      ...(input.goal ? [section("goal", input.goal)] : []),
      section("capabilities", input.capabilities),
      section("existing_titles", input.existingTitles),
    ],
    task: "Draft the playbook.",
    mock: () => mockPlaybook(input.goal),
    onUsage: input.onUsage,
  });
  const steps = object.steps.map((s) => (s.capability && allowed.has(s.capability) ? s : { ...s, capability: null, access: "none" as const }));
  return { ...object, steps };
}

type ToolSummary = { key: string; label: string; description: string; access: "read" | "write"; integration: string };

// Picks, for each step of a playbook, the actions of the tool the workspace connected for that
// step. Only tools of that step's system and access are allowed; a step the model leaves empty
// gets the closest match by name.
export async function choosePlaybookTools(input: {
  steps: PlaybookStep[];
  // The tools of the system connected for each step (empty for judgement steps).
  toolsByStep: ToolSummary[][];
  onUsage?: UsageSink;
}): Promise<string[][]> {
  const { object } = await generateStructured({
    purpose: "playbook_tools",
    modelClass: "FAST_MODEL",
    schema: PlaybookToolChoiceSchema,
    schemaName: "PlaybookToolChoice",
    systemRules: [
      "For each step, choose the one or two tools from that step's own list that do what the step says.",
      "Read steps get read tools, write steps get write tools. Never choose a tool that is not in the step's list.",
    ],
    sections: [
      section(
        "steps",
        input.steps.map((s, i) => ({ step: i, title: s.title, detail: s.detail, access: s.access, tools: input.toolsByStep[i] ?? [] })),
      ),
    ],
    task: "Choose the tools for each step.",
    mock: () => ({ steps: input.steps.map((s, i) => ({ step: i, tools: closestTools(s, input.toolsByStep[i] ?? []) })) }),
    onUsage: input.onUsage,
  });
  return input.steps.map((s, i) => {
    const own = input.toolsByStep[i] ?? [];
    const keys = new Set(own.filter((t) => s.access === "none" || t.access === s.access).map((t) => t.key));
    const chosen = (object.steps.find((x) => x.step === i)?.tools ?? []).filter((k) => keys.has(k)).slice(0, 2);
    return chosen.length ? chosen : closestTools(s, own);
  });
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .map((w) => w.replace(/(ies|s)$/, "")),
  );

// The tools (up to two) whose names and descriptions share the most words with the step, of the
// step's access.
export function closestTools(step: Pick<PlaybookStep, "title" | "detail" | "access">, tools: ToolSummary[]): string[] {
  if (step.access === "none") return [];
  const candidates = tools.filter((t) => t.access === step.access);
  if (!candidates.length) return [];
  const want = words(`${step.title} ${step.detail}`);
  const score = (t: ToolSummary) => [...words(`${t.label} ${t.description} ${t.key.replaceAll(/[._:]/g, " ")}`)].filter((w) => want.has(w)).length;
  const ranked = candidates.map((t) => ({ key: t.key, score: score(t) })).sort((a, b) => b.score - a.score);
  return ranked
    .filter((t, i) => i === 0 || (t.score > 0 && t.score >= ranked[0]!.score - 1))
    .slice(0, 2)
    .map((t) => t.key);
}

function mockPlaybook(goal?: string): PlaybookDraft {
  const refund = !goal || /refund/i.test(goal);
  if (!refund) {
    return {
      title: "Weekly pipeline follow-up",
      summary: "Finds deals with no activity for a week and drafts a follow-up for each owner to send.",
      department: "Sales",
      trigger: "Every Monday morning",
      steps: [
        { title: "Find deals with no recent activity", detail: "Open deals not touched in seven days.", capability: "crm", access: "read" },
        { title: "Decide the next step for each deal", detail: "Based on the stage and last contact.", capability: null, access: "none" },
        { title: "Draft the follow-up email", detail: "One short email per deal, for the owner to send.", capability: "email", access: "write" },
      ],
      estimatedMinutesPerOccurrence: 5,
      agent: {
        name: "Pipeline follow-up",
        description: "Keeps open deals moving with a weekly follow-up draft.",
        autonomyLevel: 2,
        instructions: {
          objective: "Make sure no open deal goes a week without contact.",
          context: "",
          rules: ["Never send an email; draft it for the deal owner"],
          steps: ["Find stale deals", "Decide the next step", "Draft the follow-up"],
          escalationConditions: ["The deal value is unusually high"],
          successConditions: ["Every stale deal has a draft"],
        },
        successCriteria: ["Every stale deal has a follow-up draft"],
      },
    };
  }
  return {
    title: "Refund request handling",
    summary: "Checks each refund request against the payment and the refund policy, and refunds eligible customers with a person approving.",
    department: "Customer Support",
    trigger: "A customer asks for a refund",
    steps: [
      { title: "Check the incoming refund ticket", detail: "Read the request, the order and the reason.", capability: "helpdesk", access: "read" },
      { title: "Check the payment", detail: "Find the customer's payment and any earlier refunds.", capability: "payments", access: "read" },
      { title: "Decide against the refund policy", detail: "Amount, time since purchase and reason.", capability: null, access: "none" },
      { title: "Issue the refund", detail: "Refund the payment once approved.", capability: "payments", access: "write" },
      { title: "Reply to the customer", detail: "Confirm the refund on the ticket.", capability: "helpdesk", access: "write" },
    ],
    estimatedMinutesPerOccurrence: 8,
    agent: {
      name: "Refund handling",
      description: "Handles refund requests end to end, with a person approving every refund.",
      autonomyLevel: 3,
      instructions: {
        objective: "Resolve every refund request the same day, within the refund policy.",
        context: "",
        rules: ["Never refund more than the original payment", "Never refund a payment that was already refunded"],
        steps: ["Read the ticket", "Find the payment", "Check the policy", "Propose the refund", "Reply to the customer"],
        escalationConditions: ["The payment cannot be found", "The request is outside the policy"],
        successConditions: ["The customer has an answer", "Eligible payments are refunded"],
      },
      successCriteria: ["Answered the same day", "No refund outside the policy"],
    },
  };
}
