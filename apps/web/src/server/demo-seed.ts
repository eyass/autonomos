/**
 * The sample company used by `pnpm db:seed:demo` and by "Explore a sample workspace":
 * departments, reviewed processes, sandbox Zendesk, Stripe and Slack with sample records,
 * a refund policy and the approved Refund Agent opportunity. Everything is fictional.
 */
import { opportunityScore, sensitiveAreas } from "@autonomos/agents";
import { sandboxStore, type DbClient } from "@autonomos/db";
import { sandboxSeed } from "@autonomos/integrations";

type Step = { title: string; performed_by: string; system?: string; requires_judgement?: boolean };
type Proc = {
  title: string;
  department: string;
  description: string;
  trigger: string;
  frequency: "event_driven" | "daily" | "weekly" | "monthly";
  occ: number;
  min: number;
  value: number;
  difficulty: number;
  risk: number;
  potential: number;
  systems: string[];
  steps: Step[];
};

const PROCESSES: Proc[] = [
  {
    title: "Refund request handling",
    department: "Customer Support",
    description: "Customers ask for refunds through support. An agent checks the payment, the refund policy and previous refunds, refunds in Stripe and replies.",
    trigger: "Customer submits a refund request ticket",
    frequency: "event_driven",
    occ: 320,
    min: 8,
    value: 4,
    difficulty: 2,
    risk: 3,
    potential: 4,
    systems: ["Zendesk", "Stripe"],
    steps: [
      { title: "Customer submits refund request", performed_by: "Customer", system: "Zendesk" },
      { title: "Support employee reads ticket", performed_by: "Support agent", system: "Zendesk" },
      { title: "Find the customer's payment", performed_by: "Support agent", system: "Stripe" },
      { title: "Check refund eligibility against policy", performed_by: "Support agent", requires_judgement: true },
      { title: "Check previous refunds", performed_by: "Support agent", system: "Stripe" },
      { title: "Approve or reject the refund", performed_by: "Support agent", requires_judgement: true },
      { title: "Execute the refund", performed_by: "Support agent", system: "Stripe" },
      { title: "Reply to the customer", performed_by: "Support agent", system: "Zendesk" },
      { title: "Close the ticket", performed_by: "Support agent", system: "Zendesk" },
    ],
  },
  {
    title: "Support ticket response",
    department: "Customer Support",
    description: "Answering common questions about accounts, listings and payments.",
    trigger: "New support ticket",
    frequency: "event_driven",
    occ: 900,
    min: 6,
    value: 4,
    difficulty: 3,
    risk: 2,
    potential: 3,
    systems: ["Zendesk"],
    steps: [
      { title: "Read the ticket", performed_by: "Support agent", system: "Zendesk" },
      { title: "Look up the account", performed_by: "Support agent" },
      { title: "Find the relevant help article", performed_by: "Support agent", requires_judgement: true },
      { title: "Write and send a reply", performed_by: "Support agent", system: "Zendesk" },
    ],
  },
  {
    title: "Flagged listing review",
    department: "Operations",
    description: "Reviewing listings flagged by users or filters for policy violations.",
    trigger: "Listing flagged",
    frequency: "event_driven",
    occ: 400,
    min: 4,
    value: 3,
    difficulty: 3,
    risk: 3,
    potential: 3,
    systems: ["Admin panel"],
    steps: [
      { title: "Open the flagged listing", performed_by: "Trust & safety" },
      { title: "Compare against listing policy", performed_by: "Trust & safety", requires_judgement: true },
      { title: "Approve, edit or remove the listing", performed_by: "Trust & safety" },
      { title: "Notify the seller", performed_by: "Trust & safety" },
    ],
  },
  {
    title: "Weekly business reporting",
    department: "Finance",
    description: "Compiling revenue, refunds and pipeline numbers into a weekly summary for leadership.",
    trigger: "Every Monday morning",
    frequency: "weekly",
    occ: 4,
    min: 90,
    value: 3,
    difficulty: 2,
    risk: 1,
    potential: 4,
    systems: ["Stripe", "HubSpot", "Slack"],
    steps: [
      { title: "Export revenue and refunds", performed_by: "Finance manager", system: "Stripe" },
      { title: "Export pipeline", performed_by: "Finance manager", system: "HubSpot" },
      { title: "Compare with last week", performed_by: "Finance manager", requires_judgement: true },
      { title: "Post the summary", performed_by: "Finance manager", system: "Slack" },
    ],
  },
  {
    title: "Inbound lead qualification",
    department: "Sales",
    description: "Researching new business leads, scoring ICP fit and deciding the next action.",
    trigger: "New lead in the CRM",
    frequency: "event_driven",
    occ: 150,
    min: 12,
    value: 4,
    difficulty: 3,
    risk: 2,
    potential: 3,
    systems: ["HubSpot", "Gmail"],
    steps: [
      { title: "Review the new lead", performed_by: "SDR", system: "HubSpot" },
      { title: "Research the company", performed_by: "SDR", requires_judgement: true },
      { title: "Score ICP fit", performed_by: "SDR", requires_judgement: true },
      { title: "Send first outreach", performed_by: "SDR", system: "Gmail" },
    ],
  },
  {
    title: "Supplier invoice processing",
    department: "Finance",
    description: "Checking supplier invoices against purchase orders and scheduling payment.",
    trigger: "Invoice received by email",
    frequency: "event_driven",
    occ: 60,
    min: 10,
    value: 3,
    difficulty: 3,
    risk: 4,
    potential: 3,
    systems: ["Gmail", "Accounting system"],
    steps: [
      { title: "Receive invoice", performed_by: "Finance manager", system: "Gmail" },
      { title: "Match to purchase order", performed_by: "Finance manager", requires_judgement: true },
      { title: "Book in accounting", performed_by: "Finance manager" },
      { title: "Schedule payment", performed_by: "Finance manager" },
    ],
  },
];

export async function seedDemoOrganization(db: DbClient, userId: string, options: { name?: string; isDemo?: boolean } = {}) {
  // 2. Organisation and departments.
  const { data: org, error: orgError } = await db
    .from("organizations")
    .insert({
      name: options.name ?? "Northwind Marketplace",
      is_demo: options.isDemo ?? false,
      industry: "Marketplace",
      employee_count: "50–99",
      country: "Netherlands",
      description: "Online marketplace connecting buyers and independent sellers.",
      company_summary: "We run a two-sided marketplace. Support handles buyer and seller questions and refunds; operations reviews listings; finance reports weekly.",
      improvement_areas: ["Customer Support", "Operations", "Finance", "Sales"],
      default_hourly_cost: 45,
      onboarding_step: "done",
      onboarding_completed_at: new Date().toISOString(),
      created_by: userId,
    })
    .select("id")
    .single();
  if (orgError || !org) throw orgError;
  await db.from("organization_members").insert({ organization_id: org.id, user_id: userId, role: "owner", can_approve: true });
  const deptIds = new Map<string, string>();
  for (const name of ["Customer Support", "Operations", "Finance", "Sales", "Marketing"]) {
    const { data } = await db.from("departments").insert({ organization_id: org.id, name }).select("id").single();
    deptIds.set(name, data!.id);
  }

  // 3. Sandbox integrations.
  const { data: catalog } = await db.from("integrations").select("key, name, permissions");
  for (const key of ["zendesk", "stripe", "slack"]) {
    const i = catalog!.find((c) => c.key === key)!;
    const { data: conn } = await db
      .from("integration_connections")
      .insert({ organization_id: org.id, integration_key: key, provider: "sandbox", account_label: `${i.name} sandbox`, granted_permissions: i.permissions, connected_by: userId })
      .select("id")
      .single();
    await db.from("integration_secrets").insert({ connection_id: conn!.id, organization_id: org.id });
  }
  const sandbox = sandboxStore(db, org.id);
  for (const { system, kind, record } of sandboxSeed()) await sandbox.put(system, kind, record);
  await db.from("documents").insert({
    organization_id: org.id,
    title: "Refund policy",
    source: "paste",
    content:
      "Refunds are allowed within 14 days of payment. One refund per customer per 90 days without a team lead. Enterprise customers require manager approval. Never refund more than the original payment.",
    created_by: userId,
  });

  // 4. Reviewed processes.
  const processIds = new Map<string, string>();
  for (const p of PROCESSES) {
    const { data } = await db
      .from("processes")
      .insert({
        organization_id: org.id,
        department_id: deptIds.get(p.department)!,
        title: p.title,
        description: p.description,
        trigger: p.trigger,
        frequency: p.frequency,
        estimated_occurrences_per_month: p.occ,
        estimated_minutes_per_occurrence: p.min,
        current_autonomy_level: 1,
        potential_autonomy_level: p.potential,
        business_value: p.value,
        automation_difficulty: p.difficulty,
        risk_level: p.risk,
        status: "reviewed",
        discovery_source: "interview",
        confidence: 0.8,
        // Sample processes in regulated areas come with a named (fictional) compliance owner.
        compliance_owner: sensitiveAreas(`${p.title} ${p.description} ${p.steps.map((x) => x.title).join(" ")}`).length ? "Finance and compliance team (sample)" : null,
        compliance_confirmed_at: new Date().toISOString(),
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        created_by: userId,
      })
      .select("id")
      .single();
    processIds.set(p.title, data!.id);
    // Every row gets every column: in a batch insert a missing key is sent as null, and
    // requires_judgement is not nullable, which silently dropped all the sample steps before.
    const { error: stepsError } = await db.from("process_steps").insert(
      p.steps.map((s, i) => ({
        organization_id: org.id,
        process_id: data!.id,
        position: i + 1,
        title: s.title,
        performed_by: s.performed_by ?? null,
        system: "system" in s ? (s.system ?? null) : null,
        requires_judgement: "requires_judgement" in s ? Boolean(s.requires_judgement) : false,
      })),
    );
    if (stepsError) throw new Error(`sample steps: ${stepsError.message}`);
    const { error: systemsError } = await db.from("process_systems").insert(p.systems.map((system) => ({ organization_id: org.id, process_id: data!.id, system })));
    if (systemsError) throw new Error(`sample systems: ${systemsError.message}`);
  }

  // 5. The approved refund opportunity. The agent is created live in the demo.
  const refundProcess = processIds.get("Refund request handling")!;
  const { data: opp } = await db
    .from("automation_opportunities")
    .insert({
      organization_id: org.id,
      process_id: refundProcess,
      department_id: deptIds.get("Customer Support")!,
      title: "Refund Agent",
      description:
        "Your team spends about 43 hours a month handling refund requests by hand. Zendesk and Stripe are already connected. An agent can read the ticket, find the payment, check the policy and prepare the refund, with a human approving anything above the limit.",
      problem: "Every refund request needs a person to read the ticket, search Stripe, check the policy and previous refunds, then refund and reply.",
      proposed_future_state: "The agent handles eligibility checks and routine refunds end to end. Humans approve refunds above the threshold and handle suspected fraud.",
      future_state_steps: [
        { title: "Refund request arrives in Zendesk", actor: "system" },
        { title: "Agent reads the ticket and identifies the customer", actor: "agent" },
        { title: "Agent finds the payment and previous refunds in Stripe", actor: "agent" },
        { title: "Agent checks eligibility against the refund policy", actor: "agent" },
        { title: "Human approves when above the limit or unclear", actor: "human", approval: true },
        { title: "Agent issues the refund in Stripe", actor: "agent" },
        { title: "Agent replies to the customer and closes the ticket", actor: "agent" },
      ],
      proposed_agent: {
        name: "Refund Agent",
        objective: "Resolve eligible refund requests quickly and within policy.",
        responsibilities: ["Verify the payment", "Check refund policy and history", "Propose or issue refunds", "Reply to the customer"],
      },
      current_autonomy_level: 1,
      target_autonomy_level: 4,
      business_value_score: 4,
      automation_difficulty_score: 2,
      risk_score: 3,
      opportunity_score: opportunityScore({ businessValue: 4, automationDifficulty: 2, currentAutonomyLevel: 1, targetAutonomyLevel: 4 }),
      estimated_hours_saved_monthly: 32,
      estimated_cost_saved_monthly: 1440,
      estimated_build_complexity: "Low",
      required_integrations: ["Zendesk", "Stripe"],
      required_approvals: ["Refunds above the autonomous limit", "Any refund at L3"],
      human_involvement: ["Approve refunds above the limit", "Handle suspected fraud", "Review weekly refund summary"],
      major_risks: ["Refunding an ineligible order", "Duplicate refunds", "Instructions hidden in customer messages"],
      rationale: "High volume, clear policy, both systems have APIs, and every action is logged.",
      template_key: "refund_handling",
      status: "approved",
      created_by: userId,
    })
    .select("id")
    .single();

  return { organizationId: org.id, opportunityId: opp!.id, processId: refundProcess };
}
