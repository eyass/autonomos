import Image from "next/image";
import { cn } from "@/lib/utils";

// Logos of the tools the public site shows, downloaded once from logo.dev into public/logos
// (scripts/fetch-logos.mjs). logo.dev holds company marks, so Google products share Google's.
export const TOOLS = {
  google: "Google Workspace",
  outlook: "Outlook",
  slack: "Slack",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  stripe: "Stripe",
  zendesk: "Zendesk",
  intercom: "Intercom",
  notion: "Notion",
  atlassian: "Atlassian (Jira)",
  asana: "Asana",
  shopify: "Shopify",
  intuit: "Intuit QuickBooks",
  xero: "Xero",
  airtable: "Airtable",
  mailchimp: "Mailchimp",
  docusign: "DocuSign",
  linear: "Linear",
  linkedin: "LinkedIn",
  meta: "Meta Ads",
  calendly: "Calendly",
  typeform: "Typeform",
  bamboohr: "BambooHR",
  personio: "Personio",
  zoom: "Zoom",
  pipedrive: "Pipedrive",
  freshdesk: "Freshdesk",
  dropbox: "Dropbox",
  monday: "monday.com",
  netsuite: "NetSuite",
  ramp: "Ramp",
  gorgias: "Gorgias",
} as const;

export type ToolSlug = keyof typeof TOOLS;

export function ToolLogo({ tool, size = 24, className, label = true }: { tool: ToolSlug; size?: number; className?: string; label?: boolean }) {
  return (
    <Image
      src={`/logos/${tool}.png`}
      alt={label ? TOOLS[tool] : ""}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-md bg-white object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
