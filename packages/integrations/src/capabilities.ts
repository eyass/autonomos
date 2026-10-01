import { integrationKeyFor } from "./directory";

// What a playbook step needs from a system, independent of which product a company uses:
// "check the incoming refund ticket" needs a help desk, "check the payment" a payment system.
// Each workspace fills a capability with one of its own connected tools.

export const CAPABILITY_KEYS = [
  "helpdesk",
  "payments",
  "accounting",
  "crm",
  "email",
  "chat",
  "calendar",
  "ecommerce",
  "documents",
  "spreadsheet",
  "projects",
  "marketing",
  "hr",
  "esign",
  "forms",
  "warehouse",
] as const;
export type Capability = (typeof CAPABILITY_KEYS)[number];

export type CapabilityInfo = {
  key: Capability;
  label: string;
  // What it is for, in the words a person would use.
  hint: string;
  // The directory group to browse when connecting one (DIRECTORY_GROUPS keys).
  group: string;
  // Common tools that fill it (Composio toolkit slugs), most used first.
  toolkits: string[];
  // Catalog categories that fill it, for tools not listed above (lower case).
  categories: string[];
};

export const CAPABILITIES: CapabilityInfo[] = [
  {
    key: "helpdesk",
    label: "Help desk",
    hint: "Where support tickets arrive",
    group: "support",
    toolkits: ["zendesk", "freshdesk", "intercom", "gorgias", "helpscout", "front"],
    categories: ["support", "customer support"],
  },
  {
    key: "payments",
    label: "Payments",
    hint: "Where payments and refunds are handled",
    group: "finance",
    toolkits: ["stripe", "paypal", "mollie", "square", "adyen", "braintree"],
    categories: ["payments"],
  },
  {
    key: "accounting",
    label: "Accounting",
    hint: "Invoices, bills and the books",
    group: "finance",
    toolkits: ["xero", "quickbooks", "freshbooks", "zoho_books", "sage"],
    categories: ["accounting", "finance & accounting"],
  },
  { key: "crm", label: "CRM", hint: "Customers, leads and deals", group: "sales", toolkits: ["hubspot", "salesforce", "pipedrive", "attio", "zoho"], categories: ["crm", "sales & crm"] },
  { key: "email", label: "Email", hint: "The inbox the work comes in through", group: "communication", toolkits: ["gmail", "outlook"], categories: ["email"] },
  { key: "chat", label: "Team chat", hint: "Where the team is told", group: "communication", toolkits: ["slack", "microsoft_teams", "discord"], categories: ["team chat"] },
  { key: "calendar", label: "Calendar", hint: "Meetings and bookings", group: "scheduling", toolkits: ["googlecalendar", "outlook", "calendly"], categories: ["calendar", "calendar & scheduling"] },
  { key: "ecommerce", label: "Online store", hint: "Orders, products and stock", group: "ecommerce", toolkits: ["shopify", "woocommerce", "bigcommerce"], categories: ["e-commerce", "ecommerce"] },
  {
    key: "documents",
    label: "Documents",
    hint: "Policies, notes and files",
    group: "productivity",
    toolkits: ["googledrive", "notion", "confluence", "dropbox", "googledocs"],
    categories: ["documents", "documents & files"],
  },
  { key: "spreadsheet", label: "Spreadsheets", hint: "Lists and trackers kept in a sheet", group: "productivity", toolkits: ["googlesheets", "airtable", "excel"], categories: ["spreadsheets"] },
  {
    key: "projects",
    label: "Project management",
    hint: "Tasks and projects",
    group: "projects",
    toolkits: ["jira", "asana", "linear", "trello", "monday", "clickup"],
    categories: ["projects & tasks", "project management"],
  },
  { key: "marketing", label: "Email marketing", hint: "Campaigns and audiences", group: "marketing", toolkits: ["mailchimp", "klaviyo", "brevo", "activecampaign"], categories: ["marketing"] },
  { key: "hr", label: "HR", hint: "People, leave and payroll", group: "hr", toolkits: ["bamboohr", "personio", "hibob", "workday"], categories: ["hr", "hr & recruiting"] },
  { key: "esign", label: "E-signature", hint: "Contracts sent for signing", group: "productivity", toolkits: ["docusign", "pandadoc", "dropbox_sign"], categories: ["signatures"] },
  {
    key: "warehouse",
    label: "Data warehouse",
    hint: "Tables of customers, orders and other records",
    group: "data",
    toolkits: ["googlebigquery"],
    categories: ["data warehouse", "analytics & data"],
  },
  { key: "forms", label: "Forms", hint: "Forms and surveys people fill in", group: "forms", toolkits: ["typeform", "googleforms", "jotform", "tally"], categories: ["forms & surveys"] },
];

const BY_KEY = new Map(CAPABILITIES.map((c) => [c.key, c]));
export const capabilityInfo = (key: string): CapabilityInfo | undefined => BY_KEY.get(key as Capability);
export const isCapability = (key: string): key is Capability => BY_KEY.has(key as Capability);

// The capabilities a connected system can fill: from the tool itself, else from its category.
export function capabilitiesOf(integrationKey: string, category?: string | null): Capability[] {
  const byTool = CAPABILITIES.filter((c) => c.toolkits.some((t) => integrationKeyFor(t) === integrationKey)).map((c) => c.key);
  if (byTool.length) return byTool;
  const cat = (category ?? "").trim().toLowerCase();
  return cat ? CAPABILITIES.filter((c) => c.categories.includes(cat)).map((c) => c.key) : [];
}
