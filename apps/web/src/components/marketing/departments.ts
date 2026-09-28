import type { Flow } from "./workflows";
import type { ToolSlug } from "./tools";

// The public pages per team: each shows illustrative workflows an agent runs across that team's
// tools. Levels follow the platform's rules (personal data, collections and money stay at L3 or
// below, or behind approval).
export type Department = { slug: string; name: string; headline: string; sub: string; tools: ToolSlug[]; flows: Flow[] };

export const DEPARTMENTS: Department[] = [
  {
    slug: "operations",
    name: "Operations",
    headline: "Orders, suppliers and tasks that keep moving.",
    sub: "Agents watch the queue and do the follow-up.",
    tools: ["shopify", "airtable", "xero", "notion", "atlassian", "slack"],
    flows: [
      {
        title: "Delayed order",
        level: 4,
        steps: [
          { tool: "shopify", action: "Order past its ship date" },
          { tool: "intercom", action: "Tell the customer" },
          { tool: "atlassian", action: "Open a Jira issue for ops" },
        ],
      },
      {
        title: "Supplier invoice intake",
        level: 3,
        steps: [
          { tool: "google", action: "Invoice arrives in Gmail" },
          { tool: "airtable", action: "Match the purchase order" },
          { tool: "xero", action: "Draft the bill", gate: "You approve it" },
          { tool: "slack", action: "Flag any mismatch" },
        ],
      },
      {
        title: "Weekly ops report",
        level: 4,
        steps: [
          { tool: "shopify", action: "Pull orders and returns" },
          { tool: "airtable", action: "Update the tracker" },
          { tool: "notion", action: "Write the summary" },
          { tool: "slack", action: "Post to #ops" },
        ],
      },
    ],
  },
  {
    slug: "marketing",
    name: "Marketing",
    headline: "Campaigns that run themselves between launches.",
    sub: "Leads routed, reports written, posts queued for approval.",
    tools: ["hubspot", "mailchimp", "typeform", "meta", "linkedin", "notion"],
    flows: [
      {
        title: "New signup nurture",
        level: 4,
        steps: [
          { tool: "typeform", action: "New signup form" },
          { tool: "hubspot", action: "Create and tag the contact" },
          { tool: "mailchimp", action: "Start the welcome journey" },
          { tool: "slack", action: "Alert sales on hot leads" },
        ],
      },
      {
        title: "Weekly campaign report",
        level: 4,
        steps: [
          { tool: "meta", action: "Pull spend and results" },
          { tool: "google", action: "Update the Sheets tracker" },
          { tool: "notion", action: "Write what changed" },
          { tool: "slack", action: "Post to #marketing" },
        ],
      },
      {
        title: "Social post",
        level: 3,
        steps: [
          { tool: "notion", action: "Draft marked ready" },
          { tool: "linkedin", action: "Schedule the post", gate: "Approved before posting" },
          { tool: "asana", action: "Close the task" },
        ],
      },
    ],
  },
  {
    slug: "finance",
    name: "Finance",
    headline: "Chasing, matching and closing, done on time.",
    sub: "Every payment and write sits behind your approval rules.",
    tools: ["xero", "intuit", "stripe", "ramp", "netsuite", "outlook"],
    flows: [
      {
        title: "Overdue invoice",
        level: 3,
        steps: [
          { tool: "xero", action: "Invoice 14 days overdue" },
          { tool: "stripe", action: "Check for a payment" },
          { tool: "outlook", action: "Send a reminder", gate: "Every write approved" },
          { tool: "slack", action: "Escalate above €1,000" },
        ],
      },
      {
        title: "Missing receipt",
        level: 3,
        steps: [
          { tool: "ramp", action: "New card spend" },
          { tool: "google", action: "Find the receipt in Gmail" },
          { tool: "intuit", action: "Categorise in QuickBooks", gate: "Approval above €500" },
          { tool: "slack", action: "Ask the cardholder if missing" },
        ],
      },
      {
        title: "Payout reconciliation",
        level: 3,
        steps: [
          { tool: "stripe", action: "Daily payouts" },
          { tool: "netsuite", action: "Match to bank lines", gate: "You approve entries" },
          { tool: "google", action: "Log exceptions in Sheets" },
          { tool: "slack", action: "Post the close checklist" },
        ],
      },
    ],
  },
  {
    slug: "sales",
    name: "Sales",
    headline: "Every lead answered, every deal followed up.",
    sub: "Agents do the CRM work so reps can sell.",
    tools: ["salesforce", "hubspot", "pipedrive", "zoom", "docusign", "google"],
    flows: [
      {
        title: "New inbound lead",
        level: 4,
        steps: [
          { tool: "hubspot", action: "New form lead" },
          { tool: "salesforce", action: "Check for an existing account" },
          { tool: "google", action: "Offer meeting slots" },
          { tool: "slack", action: "Tell the account owner" },
        ],
      },
      {
        title: "Call follow-up",
        level: 3,
        steps: [
          { tool: "zoom", action: "Call ends" },
          { tool: "salesforce", action: "Log notes and next steps" },
          { tool: "google", action: "Draft the follow-up email", gate: "The rep sends it" },
        ],
      },
      {
        title: "Deal won",
        level: 3,
        steps: [
          { tool: "pipedrive", action: "Deal marked won" },
          { tool: "docusign", action: "Send the contract", gate: "You approve it" },
          { tool: "stripe", action: "Create the first invoice" },
          { tool: "slack", action: "Hand over to finance" },
        ],
      },
    ],
  },
  {
    slug: "support",
    name: "Support",
    headline: "Tickets resolved, not just answered.",
    sub: "Agents look things up across your tools and act.",
    tools: ["zendesk", "intercom", "gorgias", "freshdesk", "shopify", "linear"],
    flows: [
      {
        title: "Refund request",
        level: 3,
        steps: [
          { tool: "zendesk", action: "Read the ticket" },
          { tool: "stripe", action: "Find the payment" },
          { tool: "policy", action: "Check refund policy" },
          { tool: "stripe", action: "Refund €72", gate: "Approval above €50" },
          { tool: "zendesk", action: "Reply and close" },
        ],
      },
      {
        title: "Where is my order",
        level: 4,
        steps: [
          { tool: "gorgias", action: "Order status question" },
          { tool: "shopify", action: "Look up the tracking" },
          { tool: "gorgias", action: "Reply with the status" },
        ],
      },
      {
        title: "Bug report",
        level: 4,
        steps: [
          { tool: "intercom", action: "Customer reports a bug" },
          { tool: "linear", action: "Find or open the issue" },
          { tool: "intercom", action: "Tell the customer" },
          { tool: "slack", action: "Alert #engineering" },
        ],
      },
    ],
  },
  {
    slug: "people",
    name: "People",
    headline: "Hiring and onboarding without the chasing.",
    sub: "Personal data stays behind approval, always.",
    tools: ["bamboohr", "personio", "calendly", "google", "slack", "notion"],
    flows: [
      {
        title: "New hire onboarding",
        level: 3,
        steps: [
          { tool: "bamboohr", action: "New hire added" },
          { tool: "google", action: "Create their account", gate: "You approve it" },
          { tool: "slack", action: "Invite and welcome" },
          { tool: "notion", action: "Start the checklist" },
        ],
      },
      {
        title: "Interview scheduling",
        level: 3,
        steps: [
          { tool: "personio", action: "Candidate moves forward" },
          { tool: "calendly", action: "Send a booking link", gate: "You approve the message" },
          { tool: "google", action: "Add the panel to the invite" },
          { tool: "slack", action: "Brief the interviewers" },
        ],
      },
      {
        title: "Leave request",
        level: 3,
        steps: [
          { tool: "bamboohr", action: "Leave requested" },
          { tool: "google", action: "Check team calendar" },
          { tool: "slack", action: "Ask the manager", gate: "Manager approves" },
          { tool: "bamboohr", action: "Record the decision" },
        ],
      },
    ],
  },
];

export const departmentBySlug = (slug: string) => DEPARTMENTS.find((d) => d.slug === slug) ?? null;
