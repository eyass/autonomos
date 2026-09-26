import {
  DEPARTMENTS,
  DiscoveryTurnSchema,
  DocumentExtractionSchema,
  GeneratedWorkflowSchema,
  type DiscoveredProcess,
  type DiscoveryTurn,
} from "@autonomos/schemas";
import { z } from "zod";
import { generateStructured, type UsageSink } from "../generate";
import { section } from "../prompt";

export type CompanyContext = {
  name: string;
  industry?: string | null;
  description?: string | null;
  summary?: string | null;
  connectedSystems: string[];
};

export type InterviewMessage = { role: "assistant" | "user"; content: string };

const EXTRACTION_RULES = [
  "You are AutonomOS, a business process analyst. Your job is structured process extraction, not conversation.",
  "Only describe work the user or the source material actually describes. Do not invent processes, systems or numbers.",
  "When a number (frequency, minutes, occurrences) is not stated, estimate conservatively, lower confidence, and add the gap to missingInformation.",
  "Autonomy levels: 1 human only, 2 agent assists, 3 agent proposes and a human approves, 4 agent executes with exceptions, 5 autonomous.",
  "Scores are 1 to 5. businessValue: frequency, time, labour cost, customer and revenue impact. automationDifficulty: systems, steps, unstructured data, judgement, API availability. riskLevel: financial, customer and legal consequence, reversibility, data sensitivity.",
  "confidence reflects how much evidence you have. Below 0.6 means the process is mostly inferred.",
];

export async function runDiscoveryTurn(input: {
  company: CompanyContext;
  department: string;
  messages: InterviewMessage[];
  existingProcesses: DiscoveredProcess[];
  onUsage?: UsageSink;
}): Promise<DiscoveryTurn> {
  const { object } = await generateStructured({
    purpose: "process_discovery",
    modelClass: "SMART_MODEL",
    schema: DiscoveryTurnSchema,
    schemaName: "DiscoveryTurn",
    systemRules: [
      ...EXTRACTION_RULES,
      "You are running a guided interview for one department. After each user answer, return the complete updated list of processes for this department and at most one targeted follow-up question.",
      "Ask about the process with the most missing information first, for example: 'When a refund request arrives, what normally happens from start to finish?'",
      "Set done to true when every process has steps, a trigger and an estimated frequency, or after the user says they are finished.",
    ],
    sections: [
      section("company_context", input.company),
      section("department", input.department),
      section("processes_so_far", input.existingProcesses),
      section("interview_transcript", input.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n"), false),
    ],
    task: "Update the process inventory for this department from the interview and choose the next question.",
    mock: () => mockDiscoveryTurn(input.department, input.messages, input.existingProcesses),
    onUsage: input.onUsage,
  });
  return object;
}

export async function extractProcessesFromDocument(input: {
  company: CompanyContext;
  title: string;
  content: string;
  onUsage?: UsageSink;
}): Promise<DiscoveredProcess[]> {
  const { object } = await generateStructured({
    purpose: "document_extraction",
    modelClass: "SMART_MODEL",
    schema: DocumentExtractionSchema,
    schemaName: "DocumentExtraction",
    systemRules: [
      ...EXTRACTION_RULES,
      "Extract every distinct recurring process described in the document. An SOP usually describes one process; a handbook may describe many.",
    ],
    sections: [section("company_context", input.company), section("document", `# ${input.title}\n\n${input.content}`, false)],
    task: "Extract the recurring processes described in this document as structured objects.",
    mock: () => ({ processes: mockProcessesFromText(input.content, "Operations", "document") }),
    onUsage: input.onUsage,
  });
  return object.processes;
}

export async function generateWorkflow(input: {
  company: CompanyContext;
  title: string;
  description: string;
  department: string;
  onUsage?: UsageSink;
}): Promise<z.infer<typeof GeneratedWorkflowSchema>> {
  const { object } = await generateStructured({
    purpose: "workflow_generation",
    modelClass: "FAST_MODEL",
    schema: GeneratedWorkflowSchema,
    schemaName: "GeneratedWorkflow",
    systemRules: [
      ...EXTRACTION_RULES,
      "Produce the ordered steps a human team currently performs for this process. 4 to 10 steps. Name the system used in each step when it is known or strongly implied.",
      "Also choose the owning department (when the given department is 'Detect', decide it; otherwise keep it) and estimate frequency, occurrences per month and minutes per occurrence conservatively from the description and company size.",
    ],
    sections: [
      section("company_context", input.company),
      section("process", { title: input.title, department: input.department }),
      section("process_description", input.description, false),
    ],
    task: "Generate the current-state workflow for this process.",
    mock: () => {
      const text = `${input.title}. ${input.description}`;
      const department = input.department === "Detect" ? guessDepartment(text) : (input.department as (typeof DEPARTMENTS)[number]);
      const p = mockProcessesFromText(text, department, "manual")[0]!;
      return {
        trigger: p.trigger,
        steps: p.steps,
        systems: p.systems,
        roles: p.roles,
        department: (DEPARTMENTS as readonly string[]).includes(department) ? department : undefined,
        frequency: p.frequency,
        estimatedOccurrencesPerMonth: p.estimatedOccurrencesPerMonth,
        estimatedMinutesPerOccurrence: p.estimatedMinutesPerOccurrence,
      };
    },
    onUsage: input.onUsage,
  });
  return object;
}

export function guessDepartment(text: string): (typeof DEPARTMENTS)[number] {
  const t = text.toLowerCase();
  if (/refund|ticket|support|complaint|customer question|inquir/.test(t)) return "Customer Support";
  if (/invoice|payment|payout|expense|reconcil|billing|accounts/.test(t)) return "Finance";
  if (/lead|prospect|deal|quote|sales|demo/.test(t)) return "Sales";
  if (/campaign|newsletter|content|social|seo/.test(t)) return "Marketing";
  if (/hire|hiring|onboard|payroll|leave|employee/.test(t)) return "HR";
  if (/bug|deploy|release|incident/.test(t)) return "Engineering";
  return "Operations";
}

// ---------------------------------------------------------------------------
// Mock implementations. Deterministic and keyword driven so the product can be
// demonstrated and tested without model credentials. Never used when a key is set.
// ---------------------------------------------------------------------------

const REFUND_PROCESS: Omit<DiscoveredProcess, "department"> = {
  title: "Refund request handling",
  description: "Customers request refunds through support. An agent verifies the payment, checks the refund policy and prior refunds, decides, refunds in Stripe and replies.",
  trigger: "Customer submits a refund request ticket",
  frequency: "event_driven",
  estimatedOccurrencesPerMonth: 320,
  estimatedMinutesPerOccurrence: 8,
  systems: ["Zendesk", "Stripe"],
  roles: ["Support agent", "Support lead"],
  steps: [
    { title: "Customer submits refund request", system: "Zendesk", performedBy: "Customer" },
    { title: "Support employee reads ticket", system: "Zendesk", performedBy: "Support agent", estimatedDurationMinutes: 1 },
    { title: "Find the customer's payment", system: "Stripe", performedBy: "Support agent", estimatedDurationMinutes: 2 },
    { title: "Check refund eligibility against policy", performedBy: "Support agent", requiresJudgement: true, estimatedDurationMinutes: 1 },
    { title: "Check previous refunds", system: "Stripe", performedBy: "Support agent", estimatedDurationMinutes: 1 },
    { title: "Approve or reject the refund", performedBy: "Support agent", requiresJudgement: true, risk: 3 },
    { title: "Execute the refund", system: "Stripe", performedBy: "Support agent", risk: 4, estimatedDurationMinutes: 1 },
    { title: "Reply to the customer", system: "Zendesk", performedBy: "Support agent", estimatedDurationMinutes: 2 },
    { title: "Close the ticket", system: "Zendesk", performedBy: "Support agent" },
  ],
  inputs: ["Refund request ticket", "Customer email", "Payment record"],
  outputs: ["Refund issued or declined", "Customer reply", "Closed ticket"],
  decisionPoints: ["Is the request within the refund window?", "Has the customer had refunds recently?"],
  exceptions: ["Payment cannot be found", "Suspected fraud", "Amount above team lead approval limit"],
  currentAutonomyLevel: 1,
  potentialAutonomyLevel: 4,
  businessValue: 4,
  automationDifficulty: 2,
  riskLevel: 3,
  missingInformation: [],
  confidence: 0.8,
};

const KEYWORD_TEMPLATES: Array<{ match: RegExp; build: (department: string) => Omit<DiscoveredProcess, "department"> }> = [
  { match: /refund/i, build: () => REFUND_PROCESS },
  {
    match: /ticket|answer|support request|inquir/i,
    build: () => ({
      title: "Support ticket response",
      description: "Answering incoming customer questions in the support inbox.",
      trigger: "New support ticket",
      frequency: "event_driven",
      estimatedOccurrencesPerMonth: 900,
      estimatedMinutesPerOccurrence: 6,
      systems: ["Zendesk"],
      roles: ["Support agent"],
      steps: [
        { title: "Read the ticket", system: "Zendesk", performedBy: "Support agent" },
        { title: "Look up the customer's account", performedBy: "Support agent" },
        { title: "Find the relevant help article or policy", performedBy: "Support agent", requiresJudgement: true },
        { title: "Write and send a reply", system: "Zendesk", performedBy: "Support agent" },
        { title: "Tag and close the ticket", system: "Zendesk", performedBy: "Support agent" },
      ],
      inputs: ["Ticket"],
      outputs: ["Reply", "Resolved ticket"],
      decisionPoints: ["Can this be answered from existing articles?"],
      exceptions: ["Angry or escalated customer", "Bug report"],
      currentAutonomyLevel: 1,
      potentialAutonomyLevel: 3,
      businessValue: 4,
      automationDifficulty: 3,
      riskLevel: 2,
      missingInformation: ["Which ticket categories make up most of the volume?"],
      confidence: 0.6,
    }),
  },
  {
    match: /report/i,
    build: () => ({
      title: "Weekly business reporting",
      description: "Compiling weekly revenue and pipeline numbers into a summary for management.",
      trigger: "Every Monday morning",
      frequency: "weekly",
      estimatedOccurrencesPerMonth: 4,
      estimatedMinutesPerOccurrence: 90,
      systems: ["Stripe", "HubSpot", "Slack"],
      roles: ["Operations manager"],
      steps: [
        { title: "Export revenue figures", system: "Stripe", performedBy: "Operations manager" },
        { title: "Export pipeline figures", system: "HubSpot", performedBy: "Operations manager" },
        { title: "Compare with the previous week", performedBy: "Operations manager", requiresJudgement: true },
        { title: "Write the summary", performedBy: "Operations manager" },
        { title: "Post to the leadership channel", system: "Slack", performedBy: "Operations manager" },
      ],
      inputs: ["Revenue data", "Pipeline data"],
      outputs: ["Weekly report"],
      decisionPoints: ["Which changes are worth flagging?"],
      exceptions: ["Data missing for the week"],
      currentAutonomyLevel: 1,
      potentialAutonomyLevel: 4,
      businessValue: 3,
      automationDifficulty: 2,
      riskLevel: 1,
      missingInformation: [],
      confidence: 0.65,
    }),
  },
  {
    match: /lead|qualif/i,
    build: () => ({
      title: "Inbound lead qualification",
      description: "Researching new inbound leads, scoring ICP fit and deciding the next action.",
      trigger: "New lead created in the CRM",
      frequency: "event_driven",
      estimatedOccurrencesPerMonth: 150,
      estimatedMinutesPerOccurrence: 12,
      systems: ["HubSpot", "Gmail"],
      roles: ["Sales development rep"],
      steps: [
        { title: "Review the new lead", system: "HubSpot", performedBy: "SDR" },
        { title: "Research the company", performedBy: "SDR", requiresJudgement: true },
        { title: "Score ICP fit", performedBy: "SDR", requiresJudgement: true },
        { title: "Update the CRM record", system: "HubSpot", performedBy: "SDR" },
        { title: "Send first outreach", system: "Gmail", performedBy: "SDR", risk: 2 },
      ],
      inputs: ["Lead record"],
      outputs: ["Lead score", "Outreach email"],
      decisionPoints: ["Is the lead a fit?"],
      exceptions: ["Existing customer", "Opted-out contact"],
      currentAutonomyLevel: 1,
      potentialAutonomyLevel: 3,
      businessValue: 4,
      automationDifficulty: 3,
      riskLevel: 2,
      missingInformation: ["What defines your ICP?"],
      confidence: 0.6,
    }),
  },
];

function titleCase(text: string) {
  const t = text.trim().replace(/\.$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function mockProcessesFromText(
  text: string,
  department: string,
  source: "interview" | "document" | "manual",
): DiscoveredProcess[] {
  const fragments = text
    .split(/[,;\n]|\band\b|\.\s/i)
    .map((f) => f.trim())
    .filter((f) => f.length > 3);
  const results: DiscoveredProcess[] = [];
  const seen = new Set<string>();
  for (const fragment of fragments.length ? fragments : [text]) {
    const template = KEYWORD_TEMPLATES.find((t) => t.match.test(fragment));
    const base = template
      ? template.build(department)
      : {
          title: titleCase(fragment).slice(0, 80),
          description: `Recurring work described as "${fragment}".`,
          trigger: undefined,
          frequency: "weekly" as const,
          estimatedOccurrencesPerMonth: 20,
          estimatedMinutesPerOccurrence: 20,
          systems: [],
          roles: [`${department} team`],
          steps: [
            { title: `Receive or notice the need for: ${fragment}`, performedBy: `${department} team` },
            { title: "Gather the information needed", performedBy: `${department} team` },
            { title: "Decide what to do", performedBy: `${department} team`, requiresJudgement: true },
            { title: "Carry out and record the work", performedBy: `${department} team` },
          ],
          inputs: [],
          outputs: [],
          decisionPoints: [],
          exceptions: [],
          currentAutonomyLevel: 1 as const,
          potentialAutonomyLevel: 2 as const,
          businessValue: 2,
          automationDifficulty: 3,
          riskLevel: 2,
          missingInformation: ["What triggers this work?", "How often does it happen?", "Which systems are used?"],
          confidence: source === "manual" ? 0.5 : 0.35,
        };
    if (seen.has(base.title)) continue;
    seen.add(base.title);
    results.push({ ...base, department });
  }
  return results.slice(0, 8);
}

export function mockDiscoveryTurn(department: string, messages: InterviewMessage[], existing: DiscoveredProcess[]): DiscoveryTurn {
  const userMessages = messages.filter((m) => m.role === "user");
  const last = userMessages.at(-1)?.content ?? "";
  const finished = /\b(done|that's all|that is all|nothing else|finish)\b/i.test(last);

  let processes = existing;
  if (userMessages.length <= 1 || existing.length === 0) {
    processes = mockProcessesFromText(last, department, "interview");
  } else {
    // Treat a follow-up answer as detail for the process that was asked about.
    const target = existing.find((p) => p.missingInformation.length > 0);
    if (target) {
      processes = existing.map((p) =>
        p === target
          ? {
              ...p,
              description: `${p.description} ${last}`.trim(),
              missingInformation: [],
              confidence: Math.min(0.85, p.confidence + 0.3),
            }
          : p,
      );
    }
  }

  const next = processes.find((p) => p.missingInformation.length > 0);
  if (finished || !next) {
    return { processes, nextQuestion: null, questionTargetsProcess: null, done: true };
  }
  return {
    processes,
    nextQuestion: `When "${next.title.toLowerCase()}" comes up, what normally happens from start to finish, how often, and which systems are involved?`,
    questionTargetsProcess: next.title,
    done: false,
  };
}
